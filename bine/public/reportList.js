import { runWindow, notice, token, makeRequest, formatCurrency, showLoad } from "./utility.js";

let currentList = "";
let allListRecords = [];

const listSelect = document.getElementById("listSelect");
const listSelectBody = document.getElementById("widget-body");

async function fetchLists() {
  runWindow("load");
  try {
    const idToken = await token();
    const response = await fetch('/api/fetchlists', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      }
    });
    const data = await response.json();

    let listHTML = data.data.map(list => `
      <div class="due-item" data-list-id="${list.id}">
        <h3>${list.name}</h3>
        <p>List ID: ${list.id}</p>
      </div>
    `).join('');
    listSelect.style.display = "flex";
    listSelectBody.innerHTML =  listHTML;

    document.querySelectorAll('.due-item').forEach(item => {
      item.addEventListener('click', function () {
        const listId = this.dataset.listId;
        closeModal();
        document.getElementById("preMode").innerHTML = listId;
        listRecords(listId);
        currentList = listId;
      });
    });
    document.getElementById("closeModal").addEventListener("click", closeModal);
    runWindow("hide");
  } catch (error) {
    console.error("Error loading lists:", error);
    notice("Error loading lists", "error");
    runWindow("hide");
  }
}

async function listRecords(listId) {
  runWindow("load");
  try {
    const response = await makeRequest("/api/listRecords", "POST", { listId });
    const data = await response.json();

    if (!response.ok || !data.success) {
      notice(data.message || 'Failed to load list records', "error");
      return;
    }

    allListRecords = data.records;
    document.getElementById("search-section").style.display = "block";
    populateListTable(allListRecords, listId);
    runWindow("hide");
  } catch (error) {
    console.error("Unexpected error:", error);
    notice(`Unexpected error: ${error.message}`, "error");
    runWindow("hide");
  }
}


document.addEventListener('DOMContentLoaded', () => {
  document.getElementById("select-list").addEventListener('click', fetchLists);
});

function populateListTable(records, listId) {
  const TableBody = document.getElementById("TableBody");
  document.getElementById("classNameHeader").textContent = listId;

  let html = "";
  let sn = 0;

  records.forEach(record => {
    sn++;
    const createdAt = record.createdAt && record.createdAt._seconds
      ? new Date(record.createdAt._seconds * 1000).toLocaleString()
      : "N/A";

    html += `
      <tr>
        <td>${sn}</td>
        <td>${record.regno || 'N/A'}</td>
        <td>${record.name || 'N/A'}</td>
        <td>${record.email || 'N/A'}</td>
        <td>${record.phone || 'N/A'}</td>
        <td>${createdAt}</td>
        <td><button class="btn btn-outline">Remove from List</button></td>
      </tr>
    `;
  });

  TableBody.innerHTML = html;
  document.getElementById("members-length").innerHTML = `Total Students: ${records.length}`;

  // Add report button
  const pre = document.getElementById("preMode");
  pre.style.display = "block";
  pre.textContent = listId.toUpperCase();
  if (!document.getElementById("list-report-button")) {
    const reportBtn = document.createElement('div');
    reportBtn.className = "btn btn-primary";
    reportBtn.id = "list-report-button";
    reportBtn.textContent = "Generate List Report";
    reportBtn.addEventListener("click", generateListReport);
    pre.appendChild(reportBtn);
  }
}

async function generateListReport() {
  const id = currentList;
  const idToken = await token();
  if (!id) {
    notice("No list selected!", "error");
    return;
  }

  try {
    showLoad("show", "list-report-button");
    const response = await fetch("/api/exportListPdf", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ id })
    });

    if (!response.ok) throw new Error("Failed to generate report");

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const unik = Date.now().toString().slice(5);
    a.download = `List_Report_${id}_${unik}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    notice("Report downloaded successfully!", "success");
    showLoad("hide", "list-report-button");
  } catch (error) {
    console.error("Report generation failed:", error);
    notice(`Report error: ${error.message}`, "error");
    showLoad("hide", "list-report-button");
  }
}

function closeModal() {
  document.getElementById("listSelect").style.display = "none";
}

window.fetchLists = fetchLists;
window.closeModal = closeModal;

const toggleSidebar = document.getElementById("toggleSidebar");
const sidebar = document.getElementById("sidebar");
const shade = document.getElementById("shade");

toggleSidebar.addEventListener("click", () => {
  sidebar.classList.toggle("show");
  shade.classList.toggle("visible");
});

shade.addEventListener("click", () => {
  sidebar.classList.remove("show");
  shade.classList.remove("visible");
});
