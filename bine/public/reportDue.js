import { runWindow, notice, token, makeRequest, formatCurrency, showLoad } from "./utility.js";

let currentDue = "";
let allRecords= [];


const dueSelect = document.getElementById("dueSelect");
const dueSelectDues = document.getElementById("widget-body");

async function fetchDues() {
  runWindow("load");
  try {
    const idToken = await token();
    const response = await fetch('/api/fetchDues', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      }
    });
    const data = await response.json();
    
    // Build the due items HTML
    let dueElements = data.data.map(due => `
      <div class="due-item" id="due-item-${due.id}" data-due-id="${due.id}">
        <h3>${due.name}</h3>
        <p>Code (Due ID): ${due.id}</p>
      </div>
    `).join('');
    
    dueSelect.style.display = "flex";
    dueSelectDues.innerHTML = dueElements;    
    document.querySelectorAll('.due-item').forEach(item => {
        item.addEventListener('click', function() {
            const dueId = this.dataset.dueId;
            console.log("Due Id is:", dueId);
            closeModal();
            document.getElementById("preMode").innerHTML = dueId;
            dueRecords(dueId);
            currentDue = dueId;
        });
    });
    document.getElementById("closeModal").addEventListener("click", closeModal);
    runWindow("hide");
  } catch (error) {
    console.error("Error:", error);
    notice("Error loading dues", "error");
    runWindow("hide");
  }
}
async function dueRecords(dueId) {
  runWindow("load");
  try {
    const response = await makeRequest("/api/dueRecords", "POST", { dueId });
    const data = await response.json();

    if (!response.ok || !data.success) {
      notice(data.message || 'Failed to load dues records', "error");
      return;
    }
    allRecords = data.records
    document.getElementById("search-section").style.display = "block";
    document.getElementById("preMode").style.display = "block";
    populateMembersTable(allRecords, dueId);
    runWindow("hide");

  } catch (error) {
    notice(`An unexpected error has occurred: ${error}`, "error");
  }
}

function populateMembersTable(records, className, ) {
  //document.getElementById("dues-table-container").style.display = "block";
  const TableBody = document.getElementById("TableBody");
  document.getElementById("classNameHeader").textContent = className;

  let tableHTML = "";
  let sn = 0;

  records.forEach(record => {
    sn++;
    record.sn = sn;

    const paidOnDate = record.paidOn && record.paidOn._seconds
      ? new Date(record.paidOn._seconds * 1000).toLocaleString()
      : "N/A";

    tableHTML += `
      <tr data-due-id="${record.regno || (record.sn * 100000).toString()}">
        <td>${record.sn}</td>
        <td>${record.regno || (record.sn * 100000).toString()}</td>
        <td>${record.studentName || 'N/A'}</td>
        <td>${record.dueBatch || 'N/A'}</td>
        <td>${formatCurrency(record.amount) || 'N/A'}</td>
        <td>${formatCurrency(record.settledAmount) || 'N/A'}</td>
        <td>${paidOnDate}</td>
        <td>
          ${record.reciept ? "Reciept Marked" : `<button class="btn btn-outline" id="confirmReciept-${record.TxId}" data-due-id="${record.TxId}" data-action-id="${record.TxId}" onclick="showRecieptWindow('${record.regno}', '${record.studentName}')">Confirm Reciept</button>`}
        </td>
      </tr>
    `;
  });
if(!document.getElementById("report-button")){
  const preMode = document.getElementById("preMode");
  const reportButton = document.createElement('div');
  reportButton.className = "btn btn-primary";
  reportButton.id = 'report-button';
  reportButton.textContent = "Generate Due Report";
  reportButton.addEventListener('click' ,generateDueReport);
  preMode.appendChild(reportButton);
}  //document.getElementById('report-button').addEventListener('', generateDueReport());

  TableBody.innerHTML = tableHTML;
  document.getElementById("members-length").innerHTML = `Total Members: ${records.length}`;

  // Add event listeners
  document.querySelectorAll('.btn-view').forEach(btn => {
    btn.addEventListener('click', (e) => viewMember(e.target.dataset.id));
  });

  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => editMember(e.target.dataset.id));
  });
}
 
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById("select-due").addEventListener('click', fetchDues);
});


function showRecieptWindow(regno, studentName){

    const content = `
      <div class="custom-modal-content">
        <div class="custom-modal-header">
          <h3 class="modal-title">Confirm Receipt</h3>
        </div>
        <div class="custom-modal-body">
          <p>Are you sure you want to confirm the receipt of this due's particulars by ${studentName}? This action cannot be undone.</p>
          <p><strong>Due ID:</strong> ${currentDue}</p>
        </div>
        <div class="custom-modal-footer">
          <button class="btn btn-outline" onclick="runWindow('hide')">Cancel</button>
          <button class="btn btn-primary" onclick="confirmDueReciept(${regno})">Mark it</button>
        </div>
      </div>`;
    
    runWindow("show", content);
}
function closeModal(){
  document.getElementById("dueSelect").style.display = "none";
}

async function confirmDueReciept(regno){
  runWindow("load");
  try{
    const response = await makeRequest("/api/confirmDueReciept", "POST", 
      {
        dueId: currentDue, 
        regno: regno.toString()
      });
    const data = await response.json();
    if (!response.ok || !data.success) {
      notice("An unexpected error occured", "error");
      runWindow("close");
      return;
    }
    notice(data.message, "success");
    dueRecords(currentDue);
    runWindow("close");
    return;
  }catch(error){
    runWindow("close");
    console.error("Error:", error);
    notice("Error updating records", "error");
    return;
  }
}

async function  generateDueReport() {
  const id = currentDue;
  const idToken = await token();
  if(!id){
    notice("No Valid due is selected!", "error");
    return;
  }
  try{
    showLoad("show", 'report-button');
    const response = await fetch("/api/exportDuePdf", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({id})
      });
  
      if (!response.ok) throw new Error("Failed to generate PDF");
  
      // Convert response to Blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const unik = ((Date.now()).toString());
      a.download = `Due_Report_:_${id}-${unik.slice(5)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
  
      notice("PDF downloaded successfully!", "success");
      showLoad("hide", "report-button");
    } catch (error) {
      notice(`Export failed: ${error.message}`, "error");
      showLoad("hide", "report-button");
      console.error("Export Error:", error);
    }
  }

function performSearch() {
  const searchTerm = document.getElementById("searchInput").value.toLowerCase().trim();
  if (!searchTerm) {
    notice("Please enter a search term", "info");
    return;
  }
  
  const filteredMembers = allRecords.filter(member => {
  const searchLower = searchTerm.toLowerCase();
  return (
    (member.studentName && member.studentName.toLowerCase().includes(searchLower)) ||
    (member.id && member.id.toLowerCase().includes(searchLower))
  );
});

if (filteredMembers.length === 0) {
  notice("No matching records found", "info");
}

populateMembersTable(filteredMembers, currentDue.toUpperCase());
}

function clearSearch() {
  document.getElementById("searchInput").value = "";
  populateMembersTable(allMembers, document.getElementById("curClass").textContent);
}
// Search functionality
document.getElementById("searchBtn").addEventListener("click", performSearch);
document.getElementById("searchInput").addEventListener("keypress", function(e) {
  if (e.key === "Enter") {
    performSearch();
  }
});

window.confirmDueReciept = confirmDueReciept;
window.showRecieptWindow = showRecieptWindow;
window.clearSearch = clearSearch;
window.runWindow = runWindow;


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
