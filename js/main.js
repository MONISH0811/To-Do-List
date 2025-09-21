// Abstract class for TodoItemFormatter
class TodoItemFormatter {
  formatTask(task, truncate = true) {
    return truncate && task.length > 14 ? task.slice(0, 14) + "..." : task;
  }

  formatDueDate(dueDate) {
    return dueDate || "No due date";
  }

  formatStatus(completed) {
    return completed ? "Completed" : "Pending";
  }

  formatTaskForDisplay(task) {
    return task.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

// Class responsible for managing Todo items
class TodoManager {
  constructor(todoItemFormatter) {
    this.todos = this.loadFromLocalStorage();
    this.todoItemFormatter = todoItemFormatter;
    this.observers = [];
    this.currentOrder = this.loadOrderFromLocalStorage();
  }

  subscribe(observer) {
    this.observers.push(observer);
  }

  notify(event, data) {
    this.observers.forEach((observer) => {
      if (observer[event]) observer[event](data);
    });
  }

  loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem("todos");
      const todos = stored ? JSON.parse(stored) : [];
      return todos.map((todo) => ({
        ...todo,
        subtasks: todo.subtasks || [],
        priority: todo.priority || 0,
        originalTask: todo.originalTask || todo.task,
        parent: todo.parent || null,
        isExpanded: todo.isExpanded !== undefined ? todo.isExpanded : true,
        createdAt: todo.createdAt || new Date().toISOString(),
        updatedAt: todo.updatedAt || new Date().toISOString(),
      }));
    } catch (error) {
      console.error("Error loading todos:", error);
      return [];
    }
  }

  loadOrderFromLocalStorage() {
    try {
      const order = localStorage.getItem("todoOrder");
      return order ? JSON.parse(order) : [];
    } catch (error) {
      console.error("Error loading order:", error);
      return [];
    }
  }

  addTodo(task, dueDate, parentId = null) {
    const newTodo = {
      id: this.getRandomId(),
      task: task.trim(),
      originalTask: task.trim(),
      dueDate: this.todoItemFormatter.formatDueDate(dueDate),
      completed: false,
      status: "pending",
      subtasks: [],
      priority: 0,
      parent: parentId,
      isExpanded: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.todos.push(newTodo);

    if (parentId) {
      const parent = this.todos.find((t) => t.id === parentId);
      if (parent) {
        parent.subtasks.push(newTodo.id);
        parent.updatedAt = new Date().toISOString();
      }
    }

    this.saveToLocalStorage();
    this.notify("todoAdded", newTodo);
    return newTodo;
  }

  editTodo(id, updatedTask) {
    const todo = this.todos.find((t) => t.id === id);
    if (todo) {
      todo.task = updatedTask.trim();
      todo.originalTask = updatedTask.trim();
      todo.updatedAt = new Date().toISOString();
      this.saveToLocalStorage();
      this.notify("todoUpdated", todo);
    }
    return todo;
  }

  deleteTodo(id) {
    const todo = this.todos.find((t) => t.id === id);
    if (!todo) return;

    // Delete subtasks recursively
    todo.subtasks.forEach((subId) => this.deleteTodo(subId));

    if (todo.parent) {
      const parent = this.todos.find((t) => t.id === todo.parent);
      if (parent) {
        parent.subtasks = parent.subtasks.filter((sid) => sid !== id);
        parent.updatedAt = new Date().toISOString();
      }
    }

    this.todos = this.todos.filter((t) => t.id !== id);
    this.currentOrder = this.currentOrder.filter((oid) => oid !== id);

    this.saveToLocalStorage();
    this.saveOrderToLocalStorage();
    this.notify("todoDeleted", { id, todo });
  }

  toggleTodoStatus(id) {
    const todo = this.todos.find((t) => t.id === id);
    if (!todo) return;

    todo.completed = !todo.completed;
    todo.status = todo.completed ? "completed" : "pending";
    todo.updatedAt = new Date().toISOString();

    // Update subtasks
    todo.subtasks.forEach((subId) => {
      const subtask = this.todos.find((t) => t.id === subId);
      if (subtask) {
        subtask.completed = todo.completed;
        subtask.status = todo.completed ? "completed" : "pending";
        subtask.updatedAt = new Date().toISOString();
      }
    });

    // Update parent
    if (todo.parent) {
      const parent = this.todos.find((t) => t.id === todo.parent);
      if (parent) {
        const allCompleted = parent.subtasks.every(
          (subId) => this.todos.find((t) => t.id === subId)?.completed
        );
        parent.completed = allCompleted;
        parent.status = allCompleted ? "completed" : "pending";
        parent.updatedAt = new Date().toISOString();
      }
    }

    this.saveToLocalStorage();
    this.notify("todoStatusChanged", todo);
  }

  toggleExpanded(id) {
    const todo = this.todos.find((t) => t.id === id);
    if (todo && todo.subtasks.length > 0) {
      todo.isExpanded = !todo.isExpanded;
      todo.updatedAt = new Date().toISOString();
      this.saveToLocalStorage();
      this.notify("todoExpansionChanged", todo);
    }
  }

  clearAllTodos() {
    const deletedTodos = [...this.todos];
    this.todos = [];
    this.currentOrder = [];
    this.saveToLocalStorage();
    this.saveOrderToLocalStorage();
    this.notify("allTodosCleared", { deletedTodos });
  }

  reorderTodos(newOrder) {
    this.currentOrder = newOrder;
    this.saveOrderToLocalStorage();
    this.notify("todosReordered", { newOrder });
  }

  filterTodos(status, searchQuery = "") {
    let filtered;
    switch (status) {
      case "all":
        filtered = this.todos;
        break;
      case "pending":
        filtered = this.todos.filter((t) => !t.completed);
        break;
      case "completed":
        filtered = this.todos.filter((t) => t.completed);
        break;
      default:
        filtered = [];
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (t) =>
          t.originalTask.toLowerCase().includes(query) ||
          t.dueDate.toLowerCase().includes(query)
      );
    }

    return this.applySortOrder(filtered);
  }

  applySortOrder(todos) {
    if (!this.currentOrder.length) return todos;

    const ordered = [];
    const unordered = [];

    todos.forEach((todo) => {
      const idx = this.currentOrder.indexOf(todo.id);
      if (idx !== -1) ordered[idx] = todo;
      else unordered.push(todo);
    });

    return ordered.filter(Boolean).concat(unordered);
  }

  getStatistics() {
    const total = this.todos.filter((t) => !t.parent).length;
    const completed = this.todos.filter((t) => !t.parent && t.completed).length;
    const pending = total - completed;
    const completionPercentage = total ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      pending,
      completionPercentage,
      totalIncludingSubtasks: this.todos.length,
      completedIncludingSubtasks: this.todos.filter((t) => t.completed).length,
    };
  }

  searchTodos(query) {
    if (!query.trim()) return this.todos;
    const q = query.toLowerCase().trim();
    return this.todos.filter(
      (t) => t.originalTask.toLowerCase().includes(q) || t.dueDate.toLowerCase().includes(q)
    );
  }

  getRandomId() {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  saveToLocalStorage() {
    localStorage.setItem("todos", JSON.stringify(this.todos));
  }

  saveOrderToLocalStorage() {
    localStorage.setItem("todoOrder", JSON.stringify(this.currentOrder));
  }
}

// UIManager class (updated drag-drop, search highlight, progress)
class UIManager {
  constructor(todoManager, todoItemFormatter) {
    this.todoManager = todoManager;
    this.todoItemFormatter = todoItemFormatter;
    this.currentFilter = "all";
    this.currentSearchQuery = "";
    this.draggedElement = null;
    this.isEditing = false;
    this.editingId = null;

    this.initializeElements();
    this.setupEventListeners();
    this.showAllTodos();
    this.updateProgressDisplay();
    this.todoManager.subscribe(this);
  }

  initializeElements() {
    this.taskInput = document.querySelector("input[type='text']");
    this.dateInput = document.querySelector(".schedule-date");
    this.addBtn = document.querySelector(".add-task-button");
    this.todosListBody = document.querySelector(".todos-list-body");
    this.alertMessage = document.querySelector(".alert-message");
    this.deleteAllBtn = document.querySelector(".delete-all-btn");
    this.searchInput = document.querySelector(".search-input");
    this.progressContainer = document.querySelector(".progress-container");
  }

  // Observer methods
  todoAdded() { this.refreshDisplay(); }
  todoUpdated() { this.refreshDisplay(); }
  todoDeleted() { this.refreshDisplay(); }
  todoStatusChanged() { this.refreshDisplay(); }
  todoExpansionChanged() { this.refreshDisplay(); }
  allTodosCleared() { this.refreshDisplay(); }
  todosReordered() { this.refreshDisplay(); }

  setupEventListeners() {
    if (this.addBtn) this.addBtn.addEventListener("click", () => this.handleAddTodo());
    if (this.taskInput) this.taskInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter" && this.taskInput.value.trim()) this.handleAddTodo();
    });

    if (this.searchInput) {
      this.searchInput.addEventListener("input", (e) => this.handleSearch(e.target.value));
      document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key === "f") {
          e.preventDefault(); this.searchInput.focus();
        }
        if (e.key === "Escape" && document.activeElement === this.searchInput) {
          this.searchInput.value = "";
          this.handleSearch("");
          this.searchInput.blur();
        }
      });
    }

    if (this.deleteAllBtn) this.deleteAllBtn.addEventListener("click", () => this.handleClearAllTodos());
    this.setupDragAndDrop();
  }

  setupDragAndDrop() {
    if (!this.todosListBody) return;

    this.todosListBody.addEventListener("dragstart", (e) => {
      const row = e.target.closest(".todo-item");
      if (!row || row.classList.contains("subtask")) return;
      this.draggedElement = row;
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("dragging");
    });

    this.todosListBody.addEventListener("dragover", (e) => {
      e.preventDefault();
      const after = this.getDragAfterElement(e.clientY);
      if (after == null) this.todosListBody.appendChild(this.draggedElement);
      else this.todosListBody.insertBefore(this.draggedElement, after);
    });

    this.todosListBody.addEventListener("dragend", () => {
      if (!this.draggedElement) return;
      this.draggedElement.classList.remove("dragging");
      this.updateTodoOrder();
      this.draggedElement = null;
    });
  }

  getDragAfterElement(y) {
    const elements = [...this.todosListBody.querySelectorAll(".todo-item:not(.dragging)")];
    return elements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  updateTodoOrder() {
    const newOrder = [...this.todosListBody.querySelectorAll(".todo-item")].map((el) => el.getAttribute("data-id"));
    this.todoManager.reorderTodos(newOrder);
  }

  handleSearch(query) {
    this.currentSearchQuery = query;
    this.refreshDisplay();
    if (query.trim()) this.highlightSearchResults(query);
  }

  highlightSearchResults(query) {
    const regex = new RegExp(`(${query})`, "gi");
    this.todosListBody.querySelectorAll(".todo-item span[data-original]").forEach((span) => {
      const text = span.getAttribute("data-original");
      span.innerHTML = text.replace(regex, '<mark class="bg-yellow-200 text-black">$1</mark>');
    });
  }

  handleAddTodo() {
    const task = this.taskInput.value.trim();
    if (!task) return this.showAlertMessage("Please enter a task", "error");

    const dueDate = this.dateInput.value;
    const parentId = this.taskInput.getAttribute("data-parent-id");

    if (this.isEditing && this.editingId) {
      this.todoManager.editTodo(this.editingId, task);
      this.showAlertMessage("Task updated successfully", "success");
      this.resetEditMode();
    } else {
      this.todoManager.addTodo(task, dueDate, parentId);
      this.showAlertMessage(parentId ? "Subtask added successfully" : "Task added successfully", "success");
    }
    this.clearInputs();
  }

  clearInputs() {
    this.taskInput.value = "";
    this.dateInput.value = "";
    this.taskInput.removeAttribute("data-parent-id");
    this.taskInput.placeholder = "Add a todo . . .";
  }

  resetEditMode() {
    this.isEditing = false;
    this.editingId = null;
    this.addBtn.innerHTML = "<i class='bx bx-plus bx-sm'></i>";
    this.taskInput.placeholder = "Add a todo . . .";
  }

  handleClearAllTodos() {
    if (!this.todoManager.todos.length) return this.showAlertMessage("No tasks to delete", "info");
    if (confirm(`Delete all ${this.todoManager.todos.length} tasks?`)) {
      this.todoManager.clearAllTodos();
      this.showAlertMessage("All tasks cleared successfully", "success");
    }
  }

  showAllTodos() {
    this.currentFilter = "all";
    this.refreshDisplay();
  }

  refreshDisplay() {
    const todos = this.todoManager.filterTodos(this.currentFilter, this.currentSearchQuery);
    this.displayTodos(todos);
    this.updateProgressDisplay();
  }

  displayTodos(todos) {
    if (!this.todosListBody) return;
    this.todosListBody.innerHTML = "";

    if (!todos.length) {
      const message = this.currentSearchQuery ? `No tasks matching "${this.currentSearchQuery}"` : "No tasks found";
      this.todosListBody.innerHTML = `<tr><td colspan="4" class="text-center py-8">${message}</td></tr>`;
      return;
    }

    todos.filter((t) => !t.parent).forEach((todo) => {
      this.renderTodoItem(todo, 0);
      if (todo.isExpanded) {
        todo.subtasks.forEach((subId) => {
          const sub = this.todoManager.todos.find((t) => t.id === subId);
          if (sub && todos.includes(sub)) this.renderTodoItem(sub, 1);
        });
      }
    });
  }

  renderTodoItem(todo, indentLevel = 0) {
    const hasSubtasks = todo.subtasks.length > 0;
    const row = document.createElement("tr");
    row.className = `todo-item ${todo.completed ? "opacity-60" : ""} ${indentLevel > 0 ? "subtask" : ""}`;
    row.setAttribute("data-id", todo.id);
    row.draggable = indentLevel === 0;

    const taskDisplay = this.todoItemFormatter.formatTaskForDisplay(todo.originalTask);

    row.innerHTML = `
      <td class="ml-${indentLevel * 6}">
        <div class="flex items-center">
          ${hasSubtasks ? `<button class="btn btn-ghost btn-xs mr-2 expand-btn"><i class="bx ${todo.isExpanded ? "bx-chevron-down" : "bx-chevron-right"}"></i></button>` : indentLevel > 0 ? '<div class="w-6"></div>' : ''}
          <span class="${todo.completed ? "line-through" : ""}" data-original="${todo.originalTask}">${taskDisplay}</span>
          ${hasSubtasks ? `<span class="badge badge-sm ml-2">${todo.subtasks.length}</span>` : ''}
        </div>
      </td>
      <td>${this.todoItemFormatter.formatDueDate(todo.dueDate)}</td>
      <td><div class="badge ${todo.completed ? "badge-success" : "badge-warning"}">${this.todoItemFormatter.formatStatus(todo.completed)}</div></td>
      <td>
        <div class="flex gap-1">
          ${indentLevel === 0 ? `<button class="btn btn-info btn-xs add-subtask-btn" title="Add Subtask"><i class="bx bx-plus"></i></button>` : ""}
          <button class="btn btn-warning btn-xs edit-btn" title="Edit"><i class="bx bx-edit-alt"></i></button>
          <button class="btn btn-success btn-xs toggle-btn" title="Toggle Status"><i class="bx ${todo.completed ? "bx-x" : "bx-check"}"></i></button>
          <button class="btn btn-error btn-xs delete-btn" title="Delete"><i class="bx bx-trash"></i></button>
        </div>
      </td>
    `;

    this.todosListBody.appendChild(row);
    this.addRowEventListeners(row, todo);
  }

  addRowEventListeners(row, todo) {
    row.querySelector(".expand-btn")?.addEventListener("click", () => this.todoManager.toggleExpanded(todo.id));
    row.querySelector(".add-subtask-btn")?.addEventListener("click", () => {
      this.taskInput.setAttribute("data-parent-id", todo.id);
      this.taskInput.placeholder = "Add a subtask . . .";
      this.taskInput.focus();
    });
    row.querySelector(".edit-btn")?.addEventListener("click", () => {
      this.isEditing = true;
      this.editingId = todo.id;
      this.taskInput.value = todo.originalTask;
      this.taskInput.focus();
      this.addBtn.innerHTML = "<i class='bx bx-save bx-sm'></i>";
    });
    row.querySelector(".toggle-btn")?.addEventListener("click", () => this.todoManager.toggleTodoStatus(todo.id));
    row.querySelector(".delete-btn")?.addEventListener("click", () => this.todoManager.deleteTodo(todo.id));
  }

  updateProgressDisplay() {
    const stats = this.todoManager.getStatistics();
    if (!this.progressContainer) return;
    this.progressContainer.innerHTML = `
      <div>Total: ${stats.total}, Completed: ${stats.completed}, Pending: ${stats.pending}</div>
      <div class="progress-bar" style="width:${stats.completionPercentage}%;"></div>
    `;
  }

  showAlertMessage(message, type = "info") {
    if (!this.alertMessage) return;
    this.alertMessage.textContent = message;
    this.alertMessage.className = `alert-message ${type}`;
    setTimeout(() => { this.alertMessage.textContent = ""; this.alertMessage.className = "alert-message"; }, 3000);
  }
}

// Initialize
const todoFormatter = new TodoItemFormatter();
const todoManager = new TodoManager(todoFormatter);
const uiManager = new UIManager(todoManager, todoFormatter);
