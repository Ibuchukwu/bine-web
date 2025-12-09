import { getCharge, notice, runWindow, showLoad, toCentralISOString, token } from "./utility.js";
import { signOut , onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import { auth } from "./firebase.js";
//connectAuthEmulator(auth, "http://localhost:9099");
let currentUser = null;


runWindow("load","");

onAuthStateChanged(auth, async (User) => {
  if (User) {
    currentUser = User;
    console.log("UID is :", currentUser.uid);
    fetchDues();
    setupEventListeners();
    runWindow("close","");
  } else {
    console.error("No user is signed in.");
    notice("No user is signed in.", "error");
    window.location.href = '/login.html';
  }
});

// DOM Elements
const toggleSidebar = document.getElementById("toggleSidebar");
const sidebar = document.getElementById("sidebar");
const shade = document.getElementById("shade");
const filterBtn = document.getElementById("filterBtn");
const filterSection = document.getElementById("filterSection");
const newDueBtn = document.getElementById("newDueBtn");
const duesTableBody = document.getElementById("duesTableBody");
const pagination = document.getElementById("pagination");

// Modal Elements
const editDueModal = document.getElementById("editDueModal");
const deleteModal = document.getElementById("deleteModal");
const viewDueModal = document.getElementById("viewDueModal");
const modalCloses = document.querySelectorAll(".modal-close, .btn-outline");

// Sample Data (Replace with real API calls)
let duesData = [];
let currentPage = 1;
const itemsPerPage = 10;
let currentFilters = {};
let currentDueId = null;

function setupEventListeners() {
  // Sidebar toggle
  toggleSidebar.addEventListener("click", () => {
    sidebar.classList.toggle("show");
    shade.classList.toggle("visible");
  });
  
  shade.addEventListener("click", () => {
    sidebar.classList.remove("show");
    shade.classList.remove("visible");
  });
  
  // Filter toggle
  filterBtn.addEventListener("click", () => {
    filterSection.style.display = filterSection.style.display === "none" ? "block" : "none";
  });
  
  // New due button
  newDueBtn.addEventListener("click", () => {
    document.getElementById("createDueModal").style.display = "flex";
    // Reset form
    document.getElementById("createDueForm").reset();
  });
  
  // Create due form submission
  document.getElementById("submitCreateDue").addEventListener("click", createNewDue);
  
  // Cancel create due
  document.getElementById("cancelCreate").addEventListener("click", () => {
    document.getElementById("createDueModal").style.display = "none";
  });
  
  // Apply filters
  document.getElementById("applyFilters").addEventListener("click", applyFilters);
  document.getElementById("resetFilters").addEventListener("click", resetFilters);
  
  // Modal close handlers
  modalCloses.forEach(closeBtn => {
    closeBtn.addEventListener("click", () => {
      editDueModal.style.display = "none";
      deleteModal.style.display = "none";
      viewDueModal.style.display = "none";
    });
  });
  
  // Close view modal
  document.getElementById("closeViewModal").addEventListener("click", () => {
    viewDueModal.style.display = "none";
  });
  
  // Save changes in edit modal
  document.getElementById("saveChanges").addEventListener("click", saveDueChanges);
  
  // Delete confirmation
  document.getElementById("confirmDelete").addEventListener("click", function() {
    showLoad("show", this.id);
    const id = this.dataset.dueId;
    confirmDeleteDue(id);
    showLoad("hide", this.id);
  });
  
  // Calculate charge
  
  document.getElementById("createDueAmount").addEventListener('change', function(){
    const amount = document.getElementById("createDueAmount").value;
    const charge = getCharge(amount);
    document.getElementById("dueCharge").value = charge;
  });
}

  // Create new due function
  async function createNewDue() {
    runWindow("load","");
    const dueName = document.getElementById("createDueName").value;
    const dueId = (document.getElementById("createdueId").value).trim().replace(" ","_");;
    const dueType = document.getElementById("createDueType").value;
    const dueAmount = document.getElementById("createDueAmount").value;
    const charge = document.getElementById("dueCharge").value;
    const dueDescription = document.getElementById("createDueDescription").value;
    const dueBatch = document.getElementById("dueBatch").value;
    const isCompulsory = document.getElementById("createIsCompulsory").checked;
    const isOneTime = document.getElementById("createIsOneTime").checked;
    const passCharge = document.getElementById("createPassCharge").checked;
    
    // Validate inputs
    if (!dueName || !dueId || !dueType || !dueAmount || !dueBatch) {
      notice("Please fill in all required fields", "info");
      return;
    }
    
    try {
       const idToken = await token();
       const response = await fetch('/api/createDue', {
         method: 'POST',
         headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
         body: JSON.stringify({
           name: dueName,
           id: dueId.trim(),
           type: dueType,
           amount: parseFloat(dueAmount),
           charge: charge,
           description: dueDescription,
           dueBatch,
           isCompulsory,
           isOneTime,
           passCharge,
           status: "active" // Default status
         })
       }); 
       const data = response.json();
       if (!response.ok) {
        notice(data.message || data.error || "Error creating Due", "error");
        runWindow("close","");
        throw new Error('Failed to create due');
       }
        runWindow("close","");
        notice(data.message || "Due created successfully!", "success");
        document.getElementById("createDueModal").style.display = "none";
        renderDuesTable(fetchDues());
    } catch (error) {
      runWindow("close","");
      console.error("Error creating due:", error);
      notice("Failed to create due. Please try again.", "error");
    }
  }

// Fetch dues from API
async function fetchDues() {
  duesData = null;
  console.log("Fetching dues...");
  try {
    const idToken = await token();
    duesTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center;"><div class="spinner"></div> Loading dues...</td></tr>`;
     const response = await fetch('/api/fetchDues', {
       method: 'GET',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${idToken}`
       }
     });
     const data = await response.json();
     console.log(data);
    duesData = data.data;
    
    // For demo purposes, we'll use mock data
    // duesData = generateMockDues(25);
    
    // Render the table
    renderDuesTable(duesData);
    renderPagination();
    return duesData;
  } catch (error) {
    console.error("Error fetching dues:", error);
    duesTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--error-color);">Error loading dues. Please try again.</td></tr>`;
    return {}
  }
}

// Apply filters to the dues
function applyFilters() {
  const statusFilter = document.getElementById("statusFilter").value;
  const typeFilter = document.getElementById("typeFilter").value;
  const dateFrom = document.getElementById("dateFrom").value;
  const dateTo = document.getElementById("dateTo").value;
  
  currentFilters = {
    status: statusFilter,
    type: typeFilter,
    dateFrom,
    dateTo
  };
  
  currentPage = 1;
  renderDuesTable(fetchDues());
  renderPagination();
  
  // Hide the filter section after applying
  filterSection.style.display = "none";
}

// Reset all filters
function resetFilters() {
  document.getElementById("statusFilter").value = "";
  document.getElementById("typeFilter").value = "";
  document.getElementById("dateFrom").value = "";
  document.getElementById("dateTo").value = "";
  
  currentFilters = {};
  currentPage = 1;
  renderDuesTable();
  renderPagination();
}

// Render the dues table
function renderDuesTable(duesData) {
  // Filter the data
  if (!Array.isArray(duesData)) {
    console.error("renderDuesTable expected an array but got:", duesData);
    return;
  }
  let filteredData = [...duesData];
  
  if (currentFilters.status) {
    filteredData = filteredData.filter(due => due.status === currentFilters.status);
  }
  
  if (currentFilters.type) {
    filteredData = filteredData.filter(due => due.type === currentFilters.type);
  }
  
  if (currentFilters.dateFrom) {
    filteredData = filteredData.filter(due => new Date(due.createdAt) >= new Date(currentFilters.dateFrom));
  }
  
  if (currentFilters.dateTo) {
    filteredData = filteredData.filter(due => new Date(due.createdAt) <= new Date(currentFilters.dateTo));
  }
  
  // Paginate the data
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, endIndex);
  
  // Render the table rows
  if (paginatedData.length === 0) {
    duesTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <i class="fas fa-clipboard-list"></i>
          <h3>No dues found</h3>
          <p>Create your first due or adjust your filters</p>
        </td>
      </tr>
    `;
    return;
  }
  
  let tableHTML = "";
  
  paginatedData.forEach(due => {
    
    let statusBadgeClass = "status-badge ";
    if (due.status === "active") statusBadgeClass += "status-active";
    else if (due.status === "inactive") statusBadgeClass += "status-inactive";
    else statusBadgeClass += "status-pending";
    
    tableHTML += `
      <tr data-due-id="${due.id}">
        <td>${due.name}</td>
        <td>${due.id}</td>
        <td>${due.type.charAt(0).toUpperCase() + due.type.slice(1)}</td>
        <td>₦${due.amount.toLocaleString()}</td>
        <td>${due.dueBatch || "A"}</td>
        <td><span class="${statusBadgeClass}">${due.status.charAt(0).toUpperCase() + due.status.slice(1)}</span></td>
        <td>${toCentralISOString(due.createdAt)}</td>
        <td class="actions-cell">
          <i class="fas fa-eye view-icon action-icon" data-action="view" data-due-id="${due.id}"></i>
          <i class="fas fa-edit edit-icon action-icon" data-action="edit" data-due-id="${due.id}"></i>
          <i class="fas fa-trash delete-icon action-icon" data-action="delete" data-due-id="${due.id}"></i>
        </td>
      </tr>
    `;
  });
  
  duesTableBody.innerHTML = tableHTML;
  
  // Add event listeners to action buttons
  document.querySelectorAll(".action-icon").forEach(icon => {
    icon.addEventListener("click", handleDueAction);
  });
}

// Handle due actions (view, edit, delete)
function handleDueAction(e) {
  const action = e.target.getAttribute("data-action");
  const dueId = e.target.getAttribute("data-due-id");
  const due = duesData.find(d => d.id === dueId);
  
  if (!due) return;
  
  currentDueId = dueId;
  
  switch (action) {
    case "view":
      openViewModal(due);
      break;
    case "edit":
      openEditModal(due);
      break;
    case "delete":
      openDeleteModal(due);
      break;
  }
}

// Open view modal with due details
function openViewModal(due) {
  document.getElementById("viewDueName").textContent = due.name;
  document.getElementById("viewdueId").textContent = due.id;
  document.getElementById("viewDueType").textContent = due.type.charAt(0).toUpperCase() + due.type.slice(1);
  document.getElementById("viewDueAmount").textContent = `₦${due.amount.toLocaleString()}`;
  document.getElementById("viewDueCharge").textContent = `₦${due.charge.toLocaleString()}`;
  document.getElementById("viewDueStatus").textContent = due.status.charAt(0).toUpperCase() + due.status.slice(1);
  document.getElementById("viewIsCompulsory").textContent = due.isCompulsory ? "Yes" : "No";
  document.getElementById("viewIsOneTime").textContent = due.isOneTime ? "Yes" : "No";
  document.getElementById("viewDueDescription").textContent = due.description || "No description provided";
  
  const createdDate = new Date(due.createdAt);
  document.getElementById("viewDueCreated").textContent = createdDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  
  // Calculate payment stats
  const totalPaid = due.totalPaid || 0;
  const totalPending = due.totalPending || 0;
  const totalAmount = due.amount;
  const completionRate = Math.round((totalPaid / totalAmount) * 100);
  
  document.getElementById("totalPaid").textContent = `₦${totalPaid.toLocaleString()}`;
  document.getElementById("totalPending").textContent = `₦${totalPending.toLocaleString()}`;
  document.getElementById("completionRate").textContent = `${completionRate}%`;
  
  viewDueModal.style.display = "flex";
}

// Open edit modal with due details
function openEditModal(due) {
  document.getElementById("editDueName").value = due.name;
  document.getElementById("editdueId").value = due.id.toLowerCase();
  document.getElementById("editDueType").value = due.type;
  document.getElementById("editDueAmount").value = due.amount;
  document.getElementById("dueCharge").value = due.charge;
  document.getElementById("dueBatch").value = due.dueBatch;
  document.getElementById("editDueStatus").value = due.status;
  document.getElementById("editDueDescription").value = due.description || "";
  document.getElementById("editIsCompulsory").checked = due.isCompulsory;
  document.getElementById("editIsOneTime").checked = due.isOneTime;
  document.getElementById("editPassCharge").checked = due.passCharge;
  
  editDueModal.style.display = "flex";
}

// Open delete confirmation modal
function openDeleteModal(due) {
  console.log("Opened Delete");
  deleteModal.style.display = "flex";
  document.getElementById("dueToDeleteName").textContent = due.name;
  document.getElementById("confirmDelete").dataset.dueId = due.id;
}

// Save changes from edit modal
async function saveDueChanges() {
  showLoad("show", "saveChanges");
  const dueName = document.getElementById("editDueName").value;
  const dueId = (document.getElementById("editdueId").value).trim().toUpperCase();
  const dueType = document.getElementById("editDueType").value;
  const dueAmount = document.getElementById("editDueAmount").value;
  const dueStatus = document.getElementById("editDueStatus").value;
  const dueDescription = document.getElementById("editDueDescription").value;
  const dueBatch = document.getElementById("editDueBatch").value;
  const isCompulsory = document.getElementById("editIsCompulsory").checked;
  const isOneTime = document.getElementById("editIsOneTime").checked;
  const passCharge = document.getElementById("editPassCharge").checked;
  
  // Validate inputs
  if (!dueName || !dueId || !dueAmount || !dueBatch) {
    notice("Please fill in all required fields", "info");
    showLoad("hide", "saveChanges");
    return;
  }
  
  try {
     const response = await fetch(`/api/editDue`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${await token()}`
       },
       body: JSON.stringify({
        "dueId": dueId,
        "updates": {
         name: dueName,
         id: dueId,
         type: dueType,
         amount: parseFloat(dueAmount),
         status: dueStatus,
         description: dueDescription,
         dueBatch,
         isCompulsory,
         isOneTime,
         passCharge
       }})
     });
     if (!response.ok) {
      showLoad("hide", "saveChanges");  
       throw new Error('Failed to update due');
     }
    editDueModal.style.display = "none";
    renderDuesTable(fetchDues());
    notice("Due updated successfully", "success");
    showLoad("hide", "saveChanges");
  } catch (error) {
    showLoad("hide", "saveChanges");
    console.error("Error updating due:", error);
    notice(`Failed to update due. Please try again. ${error}`, "error");
  }
}

async function confirmDeleteDue(dueId) {
    try {
      runWindow("load", "");
      const response = await fetch(`/api/deleteDue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await token()}`
        },
        body: JSON.stringify({ dueId})
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to delete due');
      }
      
      deleteModal.style.display = "none";
      renderDuesTable(fetchDues());
      notice("Due deleted successfully", "success");
    } catch (error) {
      console.error("Error deleting due:", error);
      notice(error.message || "Failed to delete due. Please try again.", "error");
    } finally {
      runWindow("close", "");
    }
  }

// Render pagination controls
function renderPagination() {
  // Calculate total pages
  const filteredData = filterDues();
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  
  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }
  
  let paginationHTML = "";
  
  // Previous button
  paginationHTML += `
    <button ${currentPage === 1 ? "disabled" : ""} id="prevPage">
      &laquo; Previous
    </button>
  `;
  
  // Page numbers
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
  
  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }
  
  if (startPage > 1) {
    paginationHTML += `<button data-page="1">1</button>`;
    if (startPage > 2) {
      paginationHTML += `<span>...</span>`;
    }
  }
  
  for (let i = startPage; i <= endPage; i++) {
    paginationHTML += `
      <button ${i === currentPage ? "class='active'" : ""} data-page="${i}">
        ${i}
      </button>
    `;
  }
  
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationHTML += `<span>...</span>`;
    }
    paginationHTML += `<button data-page="${totalPages}">${totalPages}</button>`;
  }
  
  // Next button
  paginationHTML += `
    <button ${currentPage === totalPages ? "disabled" : ""} id="nextPage">
      Next &raquo;
    </button>
  `;
  
  pagination.innerHTML = paginationHTML;
  
  // Add event listeners
  document.getElementById("prevPage")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderDuesTable();
    }
  });
  
  document.getElementById("nextPage")?.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderDuesTable();
    }
  });
  
  document.querySelectorAll("[data-page]").forEach(btn => {
    if (!btn.id) { // Skip prev/next buttons
      btn.addEventListener("click", () => {
        currentPage = parseInt(btn.getAttribute("data-page"));
        renderDuesTable();
      });
    }
  });
}

// Filter dues based on current filters
function filterDues() {
  let filteredData = [...duesData];
  
  if (currentFilters.status) {
    filteredData = filteredData.filter(due => due.status === currentFilters.status);
  }
  
  if (currentFilters.type) {
    filteredData = filteredData.filter(due => due.type === currentFilters.type);
  }
  
  if (currentFilters.dateFrom) {
    filteredData = filteredData.filter(due => new Date(due.createdAt) >= new Date(currentFilters.dateFrom));
  }
  
  if (currentFilters.dateTo) {
    filteredData = filteredData.filter(due => new Date(due.createdAt) <= new Date(currentFilters.dateTo));
  }
  
  return filteredData;
}


function logout() {
    signOut(auth)
      .then(() => {
        notice("Log Out Successful", "success")
        setTimeout(function(){
            window.location.href = 'login.html';
        }, 2000);
      })
      .catch((error) => {
        // Handle errors
        notice('Error logging out:', "error");
        console.error('Error logging out:', error);
      });
  }

window.logout = logout;