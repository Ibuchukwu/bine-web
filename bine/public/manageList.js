import { getCharge, notice, runWindow, showLoad, token } from "./utility.js";
import { signOut , onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import { auth } from "./firebase.js";
connectAuthEmulator(auth, "http://localhost:9099");
let currentUser = null;


runWindow("load","");

onAuthStateChanged(auth, async (User) => {
  if (User) {
    currentUser = User;
    console.log("UID is :", currentUser.uid);
    fetchlists();
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
const newlistBtn = document.getElementById("newlistBtn");
const listsTableBody = document.getElementById("listsTableBody");
const pagination = document.getElementById("pagination");

// Modal Elements
const editlistModal = document.getElementById("editlistModal");
const deleteModal = document.getElementById("deleteModal");
const viewlistModal = document.getElementById("viewlistModal");
const modalCloses = document.querySelectorAll(".modal-close, .btn-outline");

// Sample Data (Replace with real API calls)
let listsData = [];
let currentPage = 1;
const itemsPerPage = 10;
let currentFilters = {};
let currentlistId = null;

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
  
  // New list button
  newlistBtn.addEventListener("click", () => {
    console.log("Button clicked");
    document.getElementById("createlistModal").style.display = "flex";
    // Reset form
    document.getElementById("createlistForm").reset();
  });
  
  // Create list form submission
  document.getElementById("submitCreatelist").addEventListener("click", createNewlist);
  
  // Cancel create list
  document.getElementById("cancelCreate").addEventListener("click", () => {
    document.getElementById("createlistModal").style.display = "none";
  });
  
  // Apply filters
  document.getElementById("applyFilters").addEventListener("click", applyFilters);
  document.getElementById("resetFilters").addEventListener("click", resetFilters);
  
  // Modal close handlers
  modalCloses.forEach(closeBtn => {
    closeBtn.addEventListener("click", () => {
      editlistModal.style.display = "none";
      deleteModal.style.display = "none";
      viewlistModal.style.display = "none";
    });
  });
  
  // Close view modal
  document.getElementById("closeViewModal").addEventListener("click", () => {
    viewlistModal.style.display = "none";
  });
  
  // Save changes in edit modal
  document.getElementById("saveChanges").addEventListener("click", savelistChanges);
  
  // Delete confirmation
  document.getElementById("confirmDelete").addEventListener("click", function() {
    showLoad("show", this.id);
    const id = this.dataset.listId;
    confirmDeletelist(id);
    showLoad("hide", this.id);
  });
  
}

  // Create new list function
  async function createNewlist() {
    runWindow("load","");
    const listName = document.getElementById("createlistName").value;
    const listId = (document.getElementById("createlistId").value).trim().replace(" ","_");
    const listDescription = document.getElementById("createlistDescription").value;
    const listBatch = document.getElementById("listBatch").value;
    const isCompulsory = document.getElementById("createIsCompulsory").checked;
    // Validate inputs
    if (!listName || !listId || !listBatch) {
      notice("Please fill in all required fields", "info");
      return;
    }
    
    try {
       const idToken = await token();
       const response = await fetch('/api/createlist', {
         method: 'POST',
         headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
         body: JSON.stringify({
           name: listName,
           id: listId,
           description: listDescription,
           listBatch,
           isCompulsory,
           status: "active" // Default status
         })
       }); 
       const data = response.json();
       if (!response.ok) {
        notice(data.message || data.error || "Error creating list", "error");
        runWindow("close","");
        throw new Error('Failed to create list');
       }
        runWindow("close","");
        notice(data.message || "list created successfully!", "success");
        document.getElementById("createlistModal").style.display = "none";
        renderlistsTable(fetchlists());
    } catch (error) {
      runWindow("close","");
      console.error("Error creating list:", error);
      notice("Failed to create list. Please try again.", "error");
    }
  }

// Fetch lists from API
async function fetchlists() {
  listsData = null;
  console.log("Fetching lists...");
  try {
    const idToken = await token();
    listsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center;"><div class="spinner"></div> Loading lists...</td></tr>`;
     const response = await fetch('/api/fetchlists', {
       method: 'GET',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${idToken}`
       }
     });
     const data = await response.json();
     console.log(data);
    listsData = data.data;
    
    // For demo purposes, we'll use mock data
    // listsData = generateMocklists(25);
    
    // Render the table
    renderlistsTable(listsData);
    renderPagination();
    return listsData;
  } catch (error) {
    console.error("Error fetching lists:", error);
    listsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--error-color);">Error loading lists. Please try again.</td></tr>`;
    return {}
  }
}

// Apply filters to the lists
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
  renderlistsTable(fetchlists());
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
  renderlistsTable();
  renderPagination();
}

// Render the lists table
function renderlistsTable(listsData) {
  // Filter the data
  if (!Array.isArray(listsData)) {
    console.error("renderlistsTable expected an array but got:", listsData);
    return;
  }
  let filteredData = [...listsData];
  
  if (currentFilters.status) {
    filteredData = filteredData.filter(list => list.status === currentFilters.status);
  }
  
  if (currentFilters.type) {
    filteredData = filteredData.filter(list => list.type === currentFilters.type);
  }
  
  if (currentFilters.dateFrom) {
    filteredData = filteredData.filter(list => new Date(list.createdAt) >= new Date(currentFilters.dateFrom));
  }
  
  if (currentFilters.dateTo) {
    filteredData = filteredData.filter(list => new Date(list.createdAt) <= new Date(currentFilters.dateTo));
  }
  
  // Paginate the data
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, endIndex);
  
  // Render the table rows
  if (paginatedData.length === 0) {
    listsTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <i class="fas fa-clipboard-list"></i>
          <h3>No lists found</h3>
          <p>Create your first list or adjust your filters</p>
        </td>
      </tr>
    `;
    return;
  }
  
  let tableHTML = "";
  
  paginatedData.forEach(list => {
    const createdDate = new Date(list.createdAt._seconds);
    const formattedDate = createdDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
    
    let statusBadgeClass = "status-badge ";
    if (list.status === "active") statusBadgeClass += "status-active";
    else if (list.status === "inactive") statusBadgeClass += "status-inactive";
    else statusBadgeClass += "status-pending";
    
    tableHTML += `
      <tr data-list-id="${list.id}">
        <td>${list.name}</td>
        <td>${list.id}</td>
        <td>${list.listBatch || "A"}</td>
        <td><span class="${statusBadgeClass}">${list.status.charAt(0).toUpperCase() + list.status.slice(1)}</span></td>
        <td>${formattedDate}</td>
        <td class="actions-cell">
          <i class="fas fa-eye view-icon action-icon" data-action="view" data-list-id="${list.id}"></i>
          <i class="fas fa-edit edit-icon action-icon" data-action="edit" data-list-id="${list.id}"></i>
          <i class="fas fa-trash delete-icon action-icon" data-action="delete" data-list-id="${list.id}"></i>
        </td>
      </tr>
    `;
  });
  
  listsTableBody.innerHTML = tableHTML;
  
  // Add event listeners to action buttons
  document.querySelectorAll(".action-icon").forEach(icon => {
    icon.addEventListener("click", handlelistAction);
  });
}

// Handle list actions (view, edit, delete)
function handlelistAction(e) {
  const action = e.target.getAttribute("data-action");
  const listId = e.target.getAttribute("data-list-id");
  const list = listsData.find(d => d.id === listId);
  console.log(`Button for action ${action}, with List Id: ${listId} and list: ${list} has been called!`);
  if (!list) return;
  
  currentlistId = listId;
  
  switch (action) {
    case "view":
      openViewModal(list);
      break;
    case "edit":
      openEditModal(list);
      break;
    case "delete":      
        document.getElementById("deleteModal").style.display = "flex";
        document.getElementById("listToDeleteName").textContent = list.name;
        document.getElementById("confirmDelete").dataset.listId = list.id;
      break;
  }
}

// Open view modal with list details
function openViewModal(list) {
  document.getElementById("viewlistName").textContent = list.name;
  document.getElementById("viewlistId").textContent = list.id;
  document.getElementById("viewlistStatus").textContent = list.status.charAt(0).toUpperCase() + list.status.slice(1);
  document.getElementById("viewIsCompulsory").textContent = list.isCompulsory ? "Yes" : "No";
  document.getElementById("viewlistDescription").textContent = list.description || "No description provided";
  
  const createdDate = new Date(list.createdAt);
  document.getElementById("viewlistCreated").textContent = createdDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  
  document.getElementById("totalPaid").textContent = `₦${totalPaid.toLocaleString()}`;
  document.getElementById("totalPending").textContent = `₦${totalPending.toLocaleString()}`;
  document.getElementById("completionRate").textContent = `${completionRate}%`;
  
  viewlistModal.style.display = "flex";
}

// Open edit modal with list details
function openEditModal(list) {
  document.getElementById("editlistName").value = list.name;
  document.getElementById("editlistId").value = list.id;
  document.getElementById("listBatch").value = list.listBatch;
  document.getElementById("editlistStatus").value = list.status;
  document.getElementById("editlistDescription").value = list.description || "";
  document.getElementById("editIsCompulsory").checked = list.isCompulsory;
  
  editlistModal.style.display = "flex";
}

// Save changes from edit modal
async function savelistChanges() {
  showLoad("show", "saveChanges");
  const listName = document.getElementById("editlistName").value;
  const listId = (document.getElementById("editlistId").value).trim().toUpperCase();
  const listStatus = document.getElementById("editlistStatus").value;
  const listDescription = document.getElementById("editlistDescription").value;
  const listBatch = document.getElementById("editlistBatch").value;
  const isCompulsory = document.getElementById("editIsCompulsory").checked;
  // Validate inputs
  if (!listName || !listId || !listBatch) {
    notice("Please fill in all required fields", "info");
    showLoad("hide", "saveChanges");
    return;
  }
  
  try {
     const response = await fetch(`/api/editlist`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${await token()}`
       },
       body: JSON.stringify({
        "listId": listId,
        "updates": {
         name: listName,
         id: listId,
         status: listStatus,
         description: listDescription,
         listBatch,
         isCompulsory
       }})
     });
     if (!response.ok) {
      showLoad("hide", "saveChanges");  
       throw new Error('Failed to update list');
     }
    editlistModal.style.display = "none";
    renderlistsTable(fetchlists());
    notice("list updated successfully", "success");
    showLoad("hide", "saveChanges");
  } catch (error) {
    showLoad("hide", "saveChanges");
    console.error("Error updating list:", error);
    notice(`Failed to update list. Please try again. ${error}`, "error");
  }
}

async function confirmDeletelist(listId) {
    try {
      runWindow("load", "");
      const response = await fetch(`/api/deletelist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await token()}`
        },
        body: JSON.stringify({ listId})
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to delete list');
      }
      
      deleteModal.style.display = "none";
      renderlistsTable(fetchlists());
      notice("list deleted successfully", "success");
    } catch (error) {
      console.error("Error deleting list:", error);
      notice(error.message || "Failed to delete list. Please try again.", "error");
    } finally {
      runWindow("close", "");
    }
  }

// Render pagination controls
function renderPagination() {
  // Calculate total pages
  const filteredData = filterlists();
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
      renderlistsTable();
    }
  });
  
  document.getElementById("nextPage")?.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderlistsTable();
    }
  });
  
  document.querySelectorAll("[data-page]").forEach(btn => {
    if (!btn.id) { // Skip prev/next buttons
      btn.addEventListener("click", () => {
        currentPage = parseInt(btn.getAttribute("data-page"));
        renderlistsTable();
      });
    }
  });
}

// Filter lists based on current filters
function filterlists() {
  let filteredData = [...listsData];
  
  if (currentFilters.status) {
    filteredData = filteredData.filter(list => list.status === currentFilters.status);
  }
  
  if (currentFilters.type) {
    filteredData = filteredData.filter(list => list.type === currentFilters.type);
  }
  
  if (currentFilters.dateFrom) {
    filteredData = filteredData.filter(list => new Date(list.createdAt) >= new Date(currentFilters.dateFrom));
  }
  
  if (currentFilters.dateTo) {
    filteredData = filteredData.filter(list => new Date(list.createdAt) <= new Date(currentFilters.dateTo));
  }
  
  return filteredData;
}

