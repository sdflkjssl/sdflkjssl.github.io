/* Frontend-first demo interactions. Each feature is a small enhancement on
   top of server-rendered Bootstrap pages and degrades gracefully. */

// Table filter: <input data-filter-table="TABLE-ID"> narrows rows by text.
document.querySelectorAll("[data-filter-table]").forEach((input) => {
  input.addEventListener("input", () => {
    const table = document.getElementById(input.dataset.filterTable);
    if (!table) return;
    const query = input.value.trim().toLocaleLowerCase();
    table.querySelectorAll("tbody tr").forEach((row) => {
      row.hidden = query && !row.textContent.toLocaleLowerCase().includes(query);
    });
  });
});

// Confirmation on destructive buttons: <button data-confirm="Message">.
document.querySelectorAll("[data-confirm]").forEach((button) => {
  button.addEventListener("click", (event) => {
    if (!window.confirm(button.dataset.confirm)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });
});

// Preference reordering: buttons with data-move="up|down" reorder table rows.
document.querySelectorAll("[data-move]").forEach((button) => {
  button.addEventListener("click", () => {
    const row = button.closest("tr");
    const tbody = row?.parentElement;
    if (!tbody) return;
    const direction = button.dataset.move;
    if (direction === "up" && row.previousElementSibling) {
      tbody.insertBefore(row, row.previousElementSibling);
    } else if (direction === "down" && row.nextElementSibling) {
      tbody.insertBefore(row.nextElementSibling, row);
    }
  });
});
