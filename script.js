document.addEventListener("DOMContentLoaded", function () {
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("date").setAttribute("min", today);

  var task_no = parseInt(localStorage.getItem("task_id") || 0);
  let completed = JSON.parse(localStorage.getItem("completed")) || [];
  let alltodolist1 = JSON.parse(localStorage.getItem("alltodolist1")) || [];

  const task_conatiner = document.getElementById("task_conatiner");
  task_conatiner.innerHTML = "";

  const filtered_task_container = document.getElementById(
    "filtered_task_container"
  );
  filtered_task_container.innerHTML = "";

  display_todo();

  function todo_in_ls(alltodolist) {
    localStorage.setItem("alltodolist1", JSON.stringify(alltodolist));
    //   console.log("alltodolistp: " + alltodolist);
  }

  class Todolist {
    constructor(id, title, description, date, priority) {
      this.id = id;
      this.title = title;
      this.description = description;
      this.date = date;
      this.priority = priority;
    }
  }

  document
    .getElementById("formdata")
    .addEventListener("submit", function (event) {
      event.preventDefault();
      add();
    });

  function add() {
    task_no = task_no + 1;
    let title = document.getElementById("title").value;
    let description = document.getElementById("description").value;
    let date = document.getElementById("date").value;
    let prioritylevel = document.getElementById("priority_level").value;

    console.log("priority level: " + prioritylevel);

    document.getElementById("formdata").reset();

    let newtask = new Todolist(
      task_no,
      title,
      description,
      date,
      prioritylevel
    );

    //   console.log(alltodolist1);
    alltodolist1.push(newtask);
    todo_in_ls(alltodolist1);
    display_todo();
  }

  function display_todo() {
    task_conatiner.innerHTML = "";

    alltodolist1.forEach(function (item) {
      // console.log(item);
      let todo_box = document.createElement("div");
      todo_box.className = "todo_box";

      todo_box.innerHTML = `
        
        <h3> <span>${item.id}:</span> ${item.title} </h3>
        <p> ${item.description} </p>
        <h4> ${item.date} </h4>
        <h4> ${item.priority} </h4>
        <button class="edit" id="e${item.id}" data-value = "${item.id}"> Edit </button>
        <button class="delete" id="d${item.id}" data-value = "${item.id}"> Delete </button>
        <button  class="completed" id = "c${item.id}" data-value ="${item.id}" > completed </button>

    `;

      localStorage.setItem("task_id", item.id);
      task_conatiner.appendChild(todo_box);
    });

    const del = document.querySelectorAll(".delete");
    del.forEach(function (task) {
      task.addEventListener("click", function () {
        let id = this.getAttribute("data-value");
        console.log(id);
        alltodolist1 = alltodolist1.filter(function (item) {
          return item.id != id;
        });
        todo_in_ls(alltodolist1);
        display_todo();
      });
    });

    const complete = document.querySelectorAll(".completed");
    complete.forEach(function (task) {
      task.addEventListener("click", function () {
        let id = this.getAttribute("data-value");
        // console.log(id);
        let new_completed = alltodolist1.find(function (item) {
          return item.id == id;
        });
        completed.push(new_completed);
        localStorage.setItem("completed", JSON.stringify(completed));
      });
    });

    complete.forEach(function (task) {
      task.addEventListener("click", function () {
        let id = this.getAttribute("data-value");
        console.log(id);
        alltodolist1 = alltodolist1.filter(function (item) {
          return item.id != id;
        });
        todo_in_ls(alltodolist1);
        display_todo();
      });
    });

    document.querySelectorAll(".edit").forEach(function (edit) {
      edit.addEventListener("click", function () {
        let id = this.getAttribute("data-value");
        alltodolist1 = JSON.parse(localStorage.getItem("alltodolist1"));

        document.getElementById("formdata").style.display = "none";
        document.getElementById("formdata2").style.display = "block";
        document.getElementById("formdata2").scrollIntoView();

        document
          .getElementById("formdata2")
          .addEventListener("submit", function (event) {
            event.preventDefault();
            alltodolist1 = alltodolist1.map(function (item) {
              if (id == item.id) {
                item.title = document.getElementById("title2").value;
                item.description =
                  document.getElementById("description2").value;
                document.getElementById("date2").setAttribute("min", today);

                item.date = document.getElementById("date2").value;
                item.priority =
                  document.getElementById("priority_level2").value;
              }
              return item;
            });

            display_todo();
            todo_in_ls(alltodolist1);

            document.getElementById(`e${id}`).scrollIntoView();

            document.getElementById("formdata2").reset();
            document.getElementById("formdata2").style.display = "none";
            document.getElementById("formdata").style.display = "block";
          });

        console.log("alltodolist1: " + JSON.stringify(alltodolist1));
      });
    });

    document
      .getElementById("filterform")
      .addEventListener("submit", function (event) {
        event.preventDefault();

        document.getElementById("task_conatiner").style.display = "none";
        document.getElementById("filtered_task_container").style.display =
          "block";

        let status = document.getElementById("status").value;
        let precedence = document.getElementById("precedence").value;
        let deadline = document.getElementById("deadline").value;

        document.getElementById("filterform").reset();

        console.log("status: " + status);
        console.log("precedence: " + precedence);
        console.log("deadline: " + deadline);
        let due_date;
        let complete_date;
        if (deadline != "") {
          let day = parseInt(deadline, 10);

          let date = new Date();
          console.log("date: " + date);
          let d_date = new Date(date);
          let c_date = new Date(date);

          d_date.setDate(date.getDate() + day);
          c_date.setDate(date.getDate() - day);

          console.log("d_date: " + d_date);
          console.log("c_date: " + c_date);

          due_date = d_date.toISOString().split("T")[0];
          complete_date = c_date.toISOString().split("T")[0];

          console.log("due_date: " + due_date);
          console.log("completed_tasks: " + complete_date);
        }
        alltodolist1 = JSON.parse(localStorage.getItem("alltodolist1"));

        completed = JSON.parse(localStorage.getItem("completed"));

        let alltodolist2 = [];
        let completed2 = [];

        if (precedence != "" && deadline != "") {
          if (status == "pending") {
            alltodolist2 = alltodolist1.filter(function (item) {
              return precedence == item.priority && item.date <= due_date;
            });
            filtered_display_todo(alltodolist2);
          } else {
            completed2 = completed.filter(function (item) {
              return precedence == item.priority && item.date <= due_date;
            });
            filtered_display_todo1(completed2);
          }
        } else if (precedence != "" && deadline == "") {
          if (status == "pending") {
            alltodolist2 = alltodolist1.filter(function (item) {
              return precedence == item.priority;
            });
            filtered_display_todo(alltodolist2);
          } else {
            completed2 = completed.filter(function (item) {
              return precedence == item.priority;
            });
            filtered_display_todo1(completed2);
          }
        } else if (precedence == "" && deadline != "") {
          if (status == "pending") {
            alltodolist2 = alltodolist1.filter(function (item) {
              return item.date <= due_date;
            });
            filtered_display_todo(alltodolist2);
          } else {
            completed2 = completed.filter(function (item) {
              return item.date <= due_date;
            });
            filtered_display_todo1(completed2);
          }
        } else if (precedence == "" && deadline == "") {
          if (status == "pending") {
            alltodolist2 = alltodolist1.filter(function (item) {
              return item;
            });
            filtered_display_todo(alltodolist2);
          } else {
            completed2 = completed.filter(function (item) {
              return item;
            });
            filtered_display_todo1(completed2);
          }
        }

        console.log("alltodolist2: " + JSON.stringify(alltodolist2));
        console.log("completed2: " + JSON.stringify(completed2));

        function filtered_display_todo(tasks) {
          filtered_task_container.innerHTML = "";

          tasks.forEach(function (item) {
            // console.log(item);
            let todo_box = document.createElement("div");
            console.log("item: " + item);
            todo_box.className = "todo_box";

            todo_box.innerHTML = `
              
              <h3> <span>${item.id}:</span> ${item.title} 
              </h3>
              <p> ${item.description} </p>
              <h4> ${item.date} </h4>
              <h4> ${item.priority} </h4>
              <button class="eedit" id="ee${item.id}" data-value = "${item.id}"> Edit </button>
              <button class="edelete" id="dd${item.id}" data-value = "${item.id}"> Delete </button>
                     <button  class="ecompleted" id = "cc${item.id}" data-value ="${item.id}" > completed </button>
      
          `;
            filtered_task_container.appendChild(todo_box);
          });

          const del1 = document.querySelectorAll(".edelete");
          del1.forEach(function (task) {
            task.addEventListener("click", function () {
              let id = this.getAttribute("data-value");
              console.log(id);
              alltodolist1 = alltodolist1.filter(function (item) {
                return item.id != id;
              });
              alltodolist2 = alltodolist2.filter(function (item) {
                return item.id != id;
              });
              todo_in_ls(alltodolist1);
              filtered_display_todo(alltodolist2);
              display_todo();
            });
          });

          const complete1 = document.querySelectorAll(".ecompleted");
          complete1.forEach(function (task) {
            task.addEventListener("click", function () {
              let id = this.getAttribute("data-value");
              // console.log(id);
              let new_completed = alltodolist1.find(function (item) {
                return item.id == id;
              });
              let new_completed2 = alltodolist2.find(function (item) {
                return item.id == id;
              });
              completed.push(new_completed);
              localStorage.setItem("completed", JSON.stringify(completed));
            });
          });

          complete1.forEach(function (task) {
            task.addEventListener("click", function () {
              let id = this.getAttribute("data-value");
              console.log(id);
              alltodolist1 = alltodolist1.filter(function (item) {
                return item.id != id;
              });
              alltodolist2 = alltodolist2.filter(function (item) {
                return item.id != id;
              });
              todo_in_ls(alltodolist1);
              filtered_display_todo(alltodolist2);
              // display_todo();
            });
          });

          document.querySelectorAll(".eedit").forEach(function (edit) {
            edit.addEventListener("click", function () {
              let id = this.getAttribute("data-value");
              alltodolist1 = JSON.parse(localStorage.getItem("alltodolist1"));

              document.getElementById("formdata").style.display = "none";
              document.getElementById("formdata2").style.display = "block";
              document.getElementById("formdata2").scrollIntoView();

              document
                .getElementById("formdata2")
                .addEventListener("submit", function (event) {
                  event.preventDefault();
                  alltodolist1 = alltodolist1.map(function (item) {
                    if (id == item.id) {
                      item.title = document.getElementById("title2").value;
                      item.description =
                        document.getElementById("description2").value;
                      document
                        .getElementById("date2")
                        .setAttribute("min", today);

                      item.date = document.getElementById("date2").value;
                      item.priority =
                        document.getElementById("priority_level2").value;
                    }
                    return item;
                  });

                  // display_todo();
                  todo_in_ls(alltodolist1);
                  filtered_display_todo(alltodolist1);

                  document.getElementById(`e${id}`).scrollIntoView();

                  document.getElementById("formdata2").reset();
                  document.getElementById("formdata2").style.display = "none";
                  document.getElementById("formdata").style.display = "block";
                });

              console.log("alltodolist1: " + JSON.stringify(alltodolist1));
            });
          });
        }

        function filtered_display_todo1(tasks) {
          filtered_task_container.innerHTML = "";

          tasks.forEach(function (item) {
            // console.log(item);
            let todo_box = document.createElement("div");
            console.log("item: " + item);
            todo_box.className = "todo_box";

            todo_box.innerHTML = `
              
              <h4> <span>${item.id}:</span> ${item.title} 
              </h4>
              <p> ${item.description} </p>
              <h4> ${item.date} </h4>
              <h4> ${item.priority} </h4>
              <button class="inedelete" id="dd${item.id}" data-value = "${item.id}"> Delete </button>
                           
          `;
            filtered_task_container.appendChild(todo_box);
          });

          const del2 = document.querySelectorAll(".inedelete");
          del2.forEach(function (task) {
            task.addEventListener("click", function () {
              let id = this.getAttribute("data-value");
              console.log(id);
              completed = completed.filter(function (item) {
                return item.id != id;
              });
              completed2 = completed2.filter(function (item) {
                return item.id != id;
              });

              localStorage.setItem("completed", JSON.stringify(completed2));
              filtered_display_todo1(completed2);
            });
          });
        }
      });

    let toggle = 0;
    document
      .getElementById("filter_button")
      .addEventListener("click", function (event) {
        if (event.target.tagName == "BUTTON") {
          if (toggle == 1) {
            toggle = 0;
            document.getElementById("filter").style.display = "none";
            document.getElementById("task_conatiner").style.display = "block";
            document.getElementById("filtered_task_container").style.display =
              "none";
          } else {
            toggle = 1;
            document.getElementById("filter").style.display = "block";
            document.getElementById("task_conatiner").style.display = "none";
            document.getElementById("filtered_task_container").style.display =
              "block";
          }
        }
      });
  }
});

// localStorage.clear();
