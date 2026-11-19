/**
 * Aurora Companion - Windowed Variable-Height Virtual List Engine
 * Standalone MV3-safe classic script exposing window.AuroraVirtualList.
 *
 * Features:
 * - Renders only visible viewport items + overscan buffer (<80 live DOM nodes for 5,000+ items)
 * - Supports heterogeneous lists (task cards + collapsible group headers) and expandable cards
 * - ResizeObserver height cache + binary-search prefix sums (O(log N) viewport slicing)
 * - requestAnimationFrame-throttled passive scroll updates
 * - Single delegated click/keydown action handler (zero per-card listener fan-out)
 * - Smooth Pointer Events horizontal swipe with CSS `touch-action: pan-y` (zero passive:false blockers)
 * - Public API: setItems, patchItem, setExpanded, isExpanded, scrollToItem, refresh, getStats, destroy
 */
(function (global) {
  "use strict";

  function findScrollParent(el) {
    let cur = el ? el.parentElement : null;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const style = global.getComputedStyle ? global.getComputedStyle(cur) : null;
      if (style) {
        const oy = style.overflowY;
        if (oy === "auto" || oy === "scroll" || oy === "overlay") {
          return cur;
        }
      }
      cur = cur.parentElement;
    }
    return global;
  }

  class AuroraVirtualList {
    constructor(options = {}) {
      if (!options.container) {
        throw new Error("AuroraVirtualList requires a `container` DOM element.");
      }

      this.container = options.container;
      this.scrollContainer = options.scrollContainer || findScrollParent(this.container);
      this.renderItem = options.renderItem;
      this.updateItem = typeof options.updateItem === "function" ? options.updateItem : null;
      this.getItemKey = typeof options.getItemKey === "function"
        ? options.getItemKey
        : (item) => String(item && item.id !== undefined ? item.id : "");
      this.estimateHeight = typeof options.estimateHeight === "function"
        ? options.estimateHeight
        : () => (options.estimatedItemHeight || 88);
      this.overscan = typeof options.overscan === "number" ? options.overscan : 6;
      this.gap = typeof options.gap === "number" ? options.gap : 10;
      this.onAction = typeof options.onAction === "function" ? options.onAction : null;
      this.onSwipe = typeof options.onSwipe === "function" ? options.onSwipe : null;
      this.enableSwipe = options.enableSwipe !== false && Boolean(this.onSwipe);
      this.swipeThreshold = options.swipeThreshold || 88;
      this.swipeMaxOffset = options.swipeMaxOffset || 120;
      this.emptyHTML = options.emptyHTML || "";

      // Internal state
      this.items = [];
      this.keyToIndex = new Map();
      this.measuredHeights = new Map();
      this.expandedKeys = new Set();
      this.mounted = new Map(); // key -> { slot, index, item, offsetY }
      this.offsets = new Float64Array(1);
      this.totalHeight = 0;
      this.lastRange = { start: 0, end: -1 };
      this.destroyed = false;

      this._rafId = 0;
      this._needsLayout = false;
      this._swipeState = null;

      // Setup DOM mount spacer
      this.container.innerHTML = "";
      this.spacer = document.createElement("div");
      this.spacer.className = "avl_spacer";
      this.spacer.style.position = "relative";
      this.spacer.style.width = "100%";
      this.spacer.style.minHeight = "0px";
      this.spacer.style.contain = "layout style";
      this.container.appendChild(this.spacer);

      this.emptyNode = null;

      // Observers
      this._itemResizeObserver = null;
      this._viewportResizeObserver = null;
      this._initObservers();

      // Bound handlers
      this._onScroll = this._handleScroll.bind(this);
      this._onWindowResize = this._scheduleRender.bind(this);
      this._onClick = this._handleClick.bind(this);
      this._onKeyDown = this._handleKeyDown.bind(this);
      this._onPointerDown = this._handlePointerDown.bind(this);
      this._onPointerMove = this._handlePointerMove.bind(this);
      this._onPointerUp = this._handlePointerUp.bind(this);

      this._bindEvents();
    }

    _initObservers() {
      if (typeof ResizeObserver === "undefined") return;

      this._itemResizeObserver = new ResizeObserver((entries) => {
        if (this.destroyed) return;
        let changed = false;
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const slot = entry.target;
          const key = slot.dataset.avlKey;
          if (!key || !this.mounted.has(key)) continue;

          let measured = 0;
          if (entry.borderBoxSize && entry.borderBoxSize.length > 0) {
            measured = entry.borderBoxSize[0].blockSize;
          } else {
            measured = entry.contentRect.height;
          }
          measured = Math.round(measured);

          if (measured > 0) {
            const prev = this.measuredHeights.get(key);
            if (prev === undefined || Math.abs(prev - measured) >= 1) {
              this.measuredHeights.set(key, measured);
              changed = true;
            }
          }
        }
        if (changed) {
          this._needsLayout = true;
          this._scheduleRender();
        }
      });

      this._viewportResizeObserver = new ResizeObserver(() => {
        if (!this.destroyed) {
          this._scheduleRender();
        }
      });

      if (this.scrollContainer && this.scrollContainer !== global) {
        this._viewportResizeObserver.observe(this.scrollContainer);
      }
      this._viewportResizeObserver.observe(this.container);
    }

    _bindEvents() {
      this.scrollContainer.addEventListener("scroll", this._onScroll, { passive: true });
      global.addEventListener("resize", this._onWindowResize, { passive: true });
      this.spacer.addEventListener("click", this._onClick);
      this.spacer.addEventListener("keydown", this._onKeyDown);

      if (this.enableSwipe) {
        this.spacer.addEventListener("pointerdown", this._onPointerDown);
        this.spacer.addEventListener("pointermove", this._onPointerMove);
        this.spacer.addEventListener("pointerup", this._onPointerUp);
        this.spacer.addEventListener("pointercancel", this._onPointerUp);
      }
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    setItems(items, options = {}) {
      if (this.destroyed) return;
      this.items = Array.isArray(items) ? items : [];
      this.keyToIndex.clear();

      const activeKeys = new Set();
      for (let i = 0; i < this.items.length; i++) {
        const key = this.getItemKey(this.items[i]);
        this.keyToIndex.set(key, i);
        activeKeys.add(key);
      }

      // Prune measured heights & expanded keys for removed items
      if (this.measuredHeights.size > activeKeys.size + 256) {
        for (const k of this.measuredHeights.keys()) {
          if (!activeKeys.has(k)) this.measuredHeights.delete(k);
        }
      }
      for (const k of this.expandedKeys) {
        if (!activeKeys.has(k)) this.expandedKeys.delete(k);
      }

      // Handle empty state
      if (this.items.length === 0) {
        this._unmountAll();
        this.offsets = new Float64Array(1);
        this.totalHeight = 0;
        this.spacer.style.height = "0px";
        this._showEmptyState(options.emptyHTML !== undefined ? options.emptyHTML : this.emptyHTML);
        return;
      }

      this._hideEmptyState();
      this._recomputeOffsets();

      // Update any still-mounted items whose data object changed
      for (const [key, entry] of this.mounted.entries()) {
        const newIdx = this.keyToIndex.get(key);
        if (newIdx === undefined) {
          this._unmountKey(key);
        } else {
          const nextItem = this.items[newIdx];
          entry.index = newIdx;
          if (entry.item !== nextItem) {
            entry.item = nextItem;
            this._applyItemContent(entry.slot, nextItem, newIdx, true);
          }
        }
      }

      this._renderVisibleWindow(true);
    }

    patchItem(id, updatedItem) {
      if (this.destroyed) return false;
      const key = String(id);
      const index = this.keyToIndex.get(key);
      if (index === undefined) return false;

      this.items[index] = updatedItem;
      const entry = this.mounted.get(key);
      if (entry) {
        entry.item = updatedItem;
        this._applyItemContent(entry.slot, updatedItem, index, true);
        this._needsLayout = true;
        this._scheduleRender();
      }
      return true;
    }

    setExpanded(id, expanded) {
      if (this.destroyed) return;
      const key = String(id);
      const next = Boolean(expanded);
      const prev = this.expandedKeys.has(key);
      if (prev === next) return;

      if (next) this.expandedKeys.add(key);
      else this.expandedKeys.delete(key);

      // Clear cached height so new expanded/collapsed measurement takes effect cleanly
      this.measuredHeights.delete(key);

      const index = this.keyToIndex.get(key);
      if (index !== undefined) {
        const entry = this.mounted.get(key);
        if (entry) {
          this._applyItemContent(entry.slot, this.items[index], index, true);
        }
        this._recomputeOffsets();
        this._renderVisibleWindow(true);
      }
    }

    isExpanded(id) {
      return this.expandedKeys.has(String(id));
    }

    scrollToItem(id, options = {}) {
      if (this.destroyed) return false;
      const key = String(id);
      const index = this.keyToIndex.get(key);
      if (index === undefined) return false;

      const behavior = options.behavior || "smooth";
      const align = options.align || "nearest";
      const itemTop = this.offsets[index];
      const itemHeight = this._getItemHeight(index);
      const itemBottom = itemTop + itemHeight;

      const metrics = this._getViewportMetrics();
      const targetTopInScroller = metrics.containerOffset + itemTop;
      const targetBottomInScroller = metrics.containerOffset + itemBottom;

      let nextScrollTop = metrics.scrollTop;
      if (align === "start") {
        nextScrollTop = targetTopInScroller;
      } else if (align === "center") {
        nextScrollTop = targetTopInScroller - Math.max(0, (metrics.viewportHeight - itemHeight) / 2);
      } else if (align === "end") {
        nextScrollTop = targetBottomInScroller - metrics.viewportHeight;
      } else {
        // nearest
        if (targetTopInScroller < metrics.scrollTop) {
          nextScrollTop = targetTopInScroller;
        } else if (targetBottomInScroller > metrics.scrollTop + metrics.viewportHeight) {
          nextScrollTop = targetBottomInScroller - metrics.viewportHeight;
        } else {
          return true;
        }
      }

      nextScrollTop = Math.max(0, nextScrollTop);
      if (this.scrollContainer === global) {
        global.scrollTo({ top: nextScrollTop, behavior });
      } else if (typeof this.scrollContainer.scrollTo === "function") {
        this.scrollContainer.scrollTo({ top: nextScrollTop, behavior });
      } else {
        this.scrollContainer.scrollTop = nextScrollTop;
      }

      this._scheduleRender();
      return true;
    }

    refresh() {
      if (this.destroyed) return;
      if (this.items.length === 0) return;
      this._recomputeOffsets();
      this._renderVisibleWindow(true);
    }

    getStats() {
      return {
        totalItems: this.items.length,
        mountedNodes: this.mounted.size,
        startIndex: this.lastRange.start,
        endIndex: this.lastRange.end,
        totalHeight: Math.round(this.totalHeight)
      };
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;

      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = 0;
      }

      if (this._itemResizeObserver) {
        this._itemResizeObserver.disconnect();
        this._itemResizeObserver = null;
      }
      if (this._viewportResizeObserver) {
        this._viewportResizeObserver.disconnect();
        this._viewportResizeObserver = null;
      }

      this.scrollContainer.removeEventListener("scroll", this._onScroll);
      global.removeEventListener("resize", this._onWindowResize);
      this.spacer.removeEventListener("click", this._onClick);
      this.spacer.removeEventListener("keydown", this._onKeyDown);

      if (this.enableSwipe) {
        this.spacer.removeEventListener("pointerdown", this._onPointerDown);
        this.spacer.removeEventListener("pointermove", this._onPointerMove);
        this.spacer.removeEventListener("pointerup", this._onPointerUp);
        this.spacer.removeEventListener("pointercancel", this._onPointerUp);
      }

      this._unmountAll();
      this.items = [];
      this.keyToIndex.clear();
      this.measuredHeights.clear();
      this.expandedKeys.clear();
      this.container.innerHTML = "";
    }

    // -----------------------------------------------------------------------
    // Layout & Windowing Internals
    // -----------------------------------------------------------------------

    _getItemHeight(index) {
      const item = this.items[index];
      const key = this.getItemKey(item);
      const measured = this.measuredHeights.get(key);
      if (measured !== undefined) return measured;
      return Math.max(24, Number(this.estimateHeight(item, this.expandedKeys.has(key))) || 88);
    }

    _recomputeOffsets() {
      const n = this.items.length;
      if (this.offsets.length !== n + 1) {
        this.offsets = new Float64Array(n + 1);
      }
      let y = 0;
      for (let i = 0; i < n; i++) {
        this.offsets[i] = y;
        const h = this._getItemHeight(i);
        y += h + (i < n - 1 ? this.gap : 0);
      }
      this.offsets[n] = y;
      this.totalHeight = y;
      this.spacer.style.height = `${Math.ceil(y)}px`;
      this._needsLayout = false;
    }

    _findIndexForOffset(targetY) {
      const n = this.items.length;
      if (n === 0 || targetY <= 0) return 0;
      if (targetY >= this.totalHeight) return n - 1;

      let low = 0;
      let high = n - 1;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        const start = this.offsets[mid];
        const end = this.offsets[mid + 1];
        if (targetY < start) {
          high = mid - 1;
        } else if (targetY >= end) {
          low = mid + 1;
        } else {
          return mid;
        }
      }
      return Math.min(n - 1, Math.max(0, low));
    }

    _getViewportMetrics() {
      if (this.scrollContainer === global) {
        const scrollTop = global.scrollY || document.documentElement.scrollTop || 0;
        const viewportHeight = global.innerHeight || 720;
        const rect = this.container.getBoundingClientRect();
        const containerOffset = rect.top + scrollTop;
        return { scrollTop, viewportHeight, containerOffset };
      }

      const scrollTop = this.scrollContainer.scrollTop || 0;
      const viewportHeight = this.scrollContainer.clientHeight || global.innerHeight || 720;
      const scrollerRect = this.scrollContainer.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      const containerOffset = containerRect.top - scrollerRect.top + scrollTop;
      return { scrollTop, viewportHeight, containerOffset };
    }

    _handleScroll() {
      this._scheduleRender();
    }

    _scheduleRender() {
      if (this.destroyed || this._rafId) return;
      this._rafId = requestAnimationFrame(() => {
        this._rafId = 0;
        if (this.destroyed) return;
        if (this._needsLayout) {
          this._recomputeOffsets();
        }
        this._renderVisibleWindow(false);
      });
    }

    _renderVisibleWindow(forceReposition) {
      const n = this.items.length;
      if (n === 0) return;

      const { scrollTop, viewportHeight, containerOffset } = this._getViewportMetrics();
      const visibleTop = Math.max(0, scrollTop - containerOffset);
      const visibleBottom = Math.max(0, scrollTop + viewportHeight - containerOffset);

      const rawStart = this._findIndexForOffset(visibleTop);
      const rawEnd = this._findIndexForOffset(visibleBottom);

      const startIndex = Math.max(0, rawStart - this.overscan);
      const endIndex = Math.min(n - 1, rawEnd + this.overscan);

      if (
        !forceReposition &&
        startIndex === this.lastRange.start &&
        endIndex === this.lastRange.end
      ) {
        return;
      }

      this.lastRange = { start: startIndex, end: endIndex };

      const wantedKeys = new Set();
      for (let i = startIndex; i <= endIndex; i++) {
        wantedKeys.add(this.getItemKey(this.items[i]));
      }

      // Unmount out-of-range slots
      for (const key of this.mounted.keys()) {
        if (!wantedKeys.has(key)) {
          this._unmountKey(key);
        }
      }

      const fragment = document.createDocumentFragment();

      for (let i = startIndex; i <= endIndex; i++) {
        const item = this.items[i];
        const key = this.getItemKey(item);
        const offsetY = this.offsets[i];
        let entry = this.mounted.get(key);

        if (!entry) {
          const slot = document.createElement("div");
          slot.className = "avl_item";
          slot.dataset.avlKey = key;
          slot.dataset.avlIndex = String(i);
          slot.style.position = "absolute";
          slot.style.top = "0";
          slot.style.left = "0";
          slot.style.right = "0";
          slot.style.contain = "layout style paint";
          slot.style.transform = `translate3d(0, ${offsetY}px, 0)`;

          this._applyItemContent(slot, item, i, false);
          fragment.appendChild(slot);

          entry = { slot, index: i, item, offsetY };
          this.mounted.set(key, entry);

          if (this._itemResizeObserver) {
            this._itemResizeObserver.observe(slot);
          }
        } else {
          entry.index = i;
          entry.slot.dataset.avlIndex = String(i);
          if (entry.offsetY !== offsetY) {
            entry.offsetY = offsetY;
            entry.slot.style.transform = `translate3d(0, ${offsetY}px, 0)`;
          }
        }
      }

      if (fragment.childNodes.length > 0) {
        this.spacer.appendChild(fragment);
      }
    }

    _applyItemContent(slot, item, index, isUpdate) {
      const key = this.getItemKey(item);
      const state = {
        index,
        key,
        isExpanded: this.expandedKeys.has(key)
      };

      if (isUpdate && this.updateItem && slot.firstElementChild) {
        const handled = this.updateItem(slot.firstElementChild, item, state);
        if (handled !== false) return;
      }

      const rendered = this.renderItem(item, state);
      if (rendered instanceof Node) {
        slot.replaceChildren(rendered);
      } else if (typeof rendered === "string") {
        slot.innerHTML = rendered;
      }

      // Ensure swipeable card content allows native vertical scrolling on compositor
      if (this.enableSwipe) {
        const swipeTarget = slot.querySelector(".card_content");
        if (swipeTarget) {
          swipeTarget.style.touchAction = "pan-y";
        }
      }
    }

    _unmountKey(key) {
      const entry = this.mounted.get(key);
      if (!entry) return;
      if (this._itemResizeObserver) {
        this._itemResizeObserver.unobserve(entry.slot);
      }
      entry.slot.remove();
      this.mounted.delete(key);
    }

    _unmountAll() {
      for (const entry of this.mounted.values()) {
        if (this._itemResizeObserver) {
          this._itemResizeObserver.unobserve(entry.slot);
        }
        entry.slot.remove();
      }
      this.mounted.clear();
      this.lastRange = { start: 0, end: -1 };
    }

    _showEmptyState(html) {
      if (!html) {
        this._hideEmptyState();
        return;
      }
      if (!this.emptyNode) {
        this.emptyNode = document.createElement("div");
        this.emptyNode.className = "avl_empty_state";
        this.container.appendChild(this.emptyNode);
      }
      this.emptyNode.innerHTML = html;
      this.emptyNode.style.display = "";
    }

    _hideEmptyState() {
      if (this.emptyNode) {
        this.emptyNode.remove();
        this.emptyNode = null;
      }
    }

    // -----------------------------------------------------------------------
    // Delegated Interaction Handlers
    // -----------------------------------------------------------------------

    _resolveSlotFromEvent(e) {
      if (!e.target || typeof e.target.closest !== "function") return null;
      const slot = e.target.closest(".avl_item");
      if (!slot || !this.spacer.contains(slot)) return null;
      const key = slot.dataset.avlKey;
      const entry = key ? this.mounted.get(key) : null;
      return entry ? { slot, key, item: entry.item } : null;
    }

    _handleClick(e) {
      if (!this.onAction) return;
      if (this._swipeState && this._swipeState.didSwipe) {
        this._swipeState.didSwipe = false;
        return;
      }

      const resolved = this._resolveSlotFromEvent(e);
      if (!resolved) return;

      const actionEl = e.target.closest("[data-action]");
      if (actionEl && resolved.slot.contains(actionEl)) {
        const actionName = actionEl.getAttribute("data-action");
        this.onAction(e, resolved.key, actionName, actionEl, resolved.item);
        return;
      }

      // Default card click (ignore form controls and nested buttons)
      if (!e.target.closest("button, input, textarea, select, a, label")) {
        this.onAction(e, resolved.key, "card-click", resolved.slot, resolved.item);
      }
    }

    _handleKeyDown(e) {
      if (!this.onAction) return;
      const resolved = this._resolveSlotFromEvent(e);
      if (!resolved) return;

      const actionEl = e.target.closest("[data-key-action], [data-action]");
      if (!actionEl || !resolved.slot.contains(actionEl)) return;

      const keyAction = actionEl.getAttribute("data-key-action");
      if (keyAction && e.key === "Enter") {
        this.onAction(e, resolved.key, keyAction, actionEl, resolved.item);
      }
    }

    // -----------------------------------------------------------------------
    // Pointer Events Horizontal Swipe (Zero passive:false touchmove blockers)
    // -----------------------------------------------------------------------

    _handlePointerDown(e) {
      if (!this.enableSwipe) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.target.closest("button, input, textarea, select, a")) return;

      const resolved = this._resolveSlotFromEvent(e);
      if (!resolved) return;

      const card = resolved.slot.querySelector(".task_card");
      const content = resolved.slot.querySelector(".card_content");
      if (!card || !content || card.dataset.swipeable === "false") return;

      this._swipeState = {
        pointerId: e.pointerId,
        key: resolved.key,
        item: resolved.item,
        card,
        content,
        leftBg: resolved.slot.querySelector(".left_bg"),
        rightBg: resolved.slot.querySelector(".right_bg"),
        startX: e.clientX,
        startY: e.clientY,
        lastDx: 0,
        active: false,
        didSwipe: false
      };
    }

    _handlePointerMove(e) {
      const st = this._swipeState;
      if (!st || st.pointerId !== e.pointerId) return;

      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;

      if (!st.active) {
        if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) {
          // Vertical scroll won — abort swipe immediately
          this._swipeState = null;
          return;
        }
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) {
          st.active = true;
          st.didSwipe = true;
          st.content.style.transition = "none";
          try {
            st.content.setPointerCapture(e.pointerId);
          } catch (_) {}
        } else {
          return;
        }
      }

      const clamped = Math.max(-this.swipeMaxOffset, Math.min(this.swipeMaxOffset, dx));
      st.lastDx = dx;
      st.content.style.transform = `translate3d(${clamped}px, 0, 0)`;

      const progress = Math.min(Math.abs(dx) / this.swipeThreshold, 1);
      if (st.leftBg) st.leftBg.style.opacity = dx > 0 ? String(progress) : "0";
      if (st.rightBg) st.rightBg.style.opacity = dx < 0 ? String(progress) : "0";
    }

    _handlePointerUp(e) {
      const st = this._swipeState;
      if (!st || st.pointerId !== e.pointerId) return;

      if (!st.active) {
        this._swipeState = null;
        return;
      }

      try {
        if (st.content.hasPointerCapture && st.content.hasPointerCapture(e.pointerId)) {
          st.content.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}

      const dx = st.lastDx;
      st.content.style.transition = "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)";

      if (Math.abs(dx) >= this.swipeThreshold) {
        const direction = dx > 0 ? "right" : "left";
        st.content.style.transform = `translate3d(${dx > 0 ? "100%" : "-100%"}, 0, 0)`;
        const { key, item, content, leftBg, rightBg } = st;
        setTimeout(() => {
          // Reset visual transform in case caller cancels or keeps item mounted
          content.style.transform = "translate3d(0, 0, 0)";
          if (leftBg) leftBg.style.opacity = "0";
          if (rightBg) rightBg.style.opacity = "0";
          if (this.onSwipe) {
            this.onSwipe(key, direction, item);
          }
        }, 160);
      } else {
        st.content.style.transform = "translate3d(0, 0, 0)";
        if (st.leftBg) st.leftBg.style.opacity = "0";
        if (st.rightBg) st.rightBg.style.opacity = "0";
      }

      // Preserve didSwipe flag for the trailing click event on pointerup
      const didSwipe = st.didSwipe;
      this._swipeState = didSwipe ? { didSwipe: true } : null;
      if (didSwipe) {
        setTimeout(() => {
          if (this._swipeState && !this._swipeState.pointerId) {
            this._swipeState = null;
          }
        }, 50);
      }
    }
  }

  global.AuroraVirtualList = AuroraVirtualList;
})(typeof window !== "undefined" ? window : globalThis);
