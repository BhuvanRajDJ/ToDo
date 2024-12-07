document.addEventListener("DOMContentLoaded", function () {
  let completedtasks = JSON.parse(localStorage.getItem("completed")) || [];
  let alltodolist1 = JSON.parse(localStorage.getItem("alltodolist1")) || [];

  function display_completed_tasks() {
    const completed_tasks = document.getElementById("completed_tasks");
    completed_tasks.innerHTML = "";

    completedtasks.forEach(function (item) {
      const display = document.createElement("div");
      display.className = "todo_box";
      display.innerHTML = `
      
        <h3><span>${item.id}:</span> ${item.title}</h3>
        <p>${item.description}</p>
        <h4>${item.date}</h4>
        <h4>${item.priority}</h4>
        <button class="delete" id="d${item.id}" data-value = "${item.id}">Delete</button>
        <button class="incomplete" id = "c${item.id}" data-value ="${item.id}" >In complete</button>
    `;
      completed_tasks.appendChild(display);
    });
    addEventListeners();
  }

  function addEventListeners() {
    document.querySelectorAll(".delete").forEach(function (deletet) {
      deletet.addEventListener("click", function () {
        let id = this.getAttribute("data-value");
        completedtasks = completedtasks.filter(function (item) {
          return item.id != id;
        });
        localStorage.setItem("completed", JSON.stringify(completedtasks));
        display_completed_tasks();
      });
    });

    document.querySelectorAll(".incomplete").forEach(function (incompletebtn) {
      incompletebtn.addEventListener("click", function () {
        let id = this.getAttribute("data-value");
        let task = completedtasks.find(function (item) {
          return item.id == id;
        });
        alltodolist1.push(task);
        localStorage.setItem("alltodolist1", JSON.stringify(alltodolist1));
        completedtasks = completedtasks.filter(function (item) {
          return item.id != id;
        });
        localStorage.setItem("completed", JSON.stringify(completedtasks));
        display_completed_tasks();
      });
    });
  }

  display_completed_tasks();
});

// localStorage.clear();
