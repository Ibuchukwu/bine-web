import { initiatePayment } from "./portalPay.js";
import { makeRequest, notice, runWindow, showLoad, toCentralISOString } from "./utility.js";



let allSchools = {};
let regLen;
let profileDetails = {};

let totalPay = 0;
let cart = [];
const duesContainer = document.getElementById('dues-container');
const showDuesBtn = document.getElementById('show-dues-btn');
const totalSection = document.getElementById('total-section');
const totalPayElement = document.getElementById('total-pay');
const checkoutBtn = document.getElementById('checkout-btn');

const showListsBtn = document.getElementById('show-lists-btn');
const listsContainer = document.getElementById('lists-container');

// Event listeners
showDuesBtn.addEventListener('click', function(){
  const status = showDuesBtn.dataset.status;
  if(status == "hidden" || !status){
      duesContainer.innerHTML = '';
      duesContainer.style.display = 'flex';
      totalSection.style.display = 'block';
      showDuesBtn.innerHTML = "Hide Dues";
      showDuesBtn.dataset.status = "shown";
      showDues();
  }else if(status == "shown"){
      duesContainer.style.display = 'none';
      totalSection.style.display = 'none';
      showDuesBtn.innerHTML = "Show Dues";
      showDuesBtn.dataset.status = "hidden";
  }
});
checkoutBtn.addEventListener('click', proceedToCheckout);

showListsBtn.addEventListener('click', function(){
  const status = showListsBtn.dataset.status;
  if(status == "hidden" || !status){
      listsContainer.innerHTML = '';
      listsContainer.style.display = 'flex';
      showListsBtn.innerHTML = "Hide Lists";
      showListsBtn.dataset.status = "shown";
      showLists();
  }else if(status == "shown"){
      listsContainer.style.display = 'none';
      showListsBtn.innerHTML= "Show Lists";
      showListsBtn.dataset.status = "hidden";
  }
});

// Format currency
function formatCurrency(amount) {
    return parseFloat(amount).toLocaleString('en-NG', { 
        style: 'currency', 
        currency: 'NGN',
        minimumFractionDigits: 2
    });
}

function assignLength(){
  const universityId = document.getElementById("university").value;
  regLen = allSchools[universityId].regLen;
}

async function getProfile() {
  const school = document.getElementById('university').value;
  const regnoElement = document.getElementById("regno");
  const detailsElement = document.getElementById("profileDetails");
  const regno = regnoElement.value.trim();
  
  // Clear previous results and errors
  detailsElement.innerHTML = '';
  detailsElement.style.display = 'none';
  
  // Validation
  if(school){
    if (regno.length == regLen){
      regnoElement.disabled = true;
      detailsElement.style.display = "block";
      detailsElement.innerHTML = `
        <div class="loading-profile">
          <p>Fetching student profile for ${regno}...</p>
          <i class="fa-solid fa-spinner fa-spin-pulse"></i>
        </div>
      `;
      
      try {
        const response = await fetch('/api/getProfile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            universityId: school,
            regno: regno
          })
        });
        const data = await response.json();
        detailsElement.style.padding = "15px";
        detailsElement.style.display = "flex";
        if (!response.ok) {
          if (!data.success) {
            detailsElement.innerHTML = 'Profile not found! <br><a href="create_profile" style="color: white;"><div style="background-color: #005B96; padding: 5px; border-radius: 6px; margin: 5px;">Create your Student Profile</div></a>';
            notice('Profile not found', "info");
            return ;
          }
          notice('Failed to fetch profile', "error");
          return;
        }if(!data.details.profileVerified){
            detailsElement.innerHTML = 'This profile is still awaiting verification by the Course Representative. Kindy contact your Course Representative for resoltion.';
            notice('Profile yet to be verified!', "info");
            return;
          }
        
        // Display profile data
        detailsElement.style.display = "block";
        detailsElement.innerHTML = `
          <div class="profile-card">
            <h3>Student Profile</h3>
            <div class="profile-detail">
              <span class="detail-label">Name:</span>
              <span class="detail-value">${data.details.name || 'Not available'}</span>
            </div>
            <div class="profile-detail">
              <span class="detail-label">Department:</span>
              <span class="detail-value">${data.details.departmentName || 'Not available'}</span>
            </div>
            <div class="profile-detail">
              <span class="detail-label">Class:</span>
              <span class="detail-value">${(data.details.classId).toUpperCase() || 'Not available'}</span>
            </div>
          </div>
        `;
        profileDetails = data.details;
        
      } catch (error) {
        console.error('Profile fetch error:', error);
        notice(detailsElement, error.message || 'An error occurred while fetching profile', "error");
      } finally {
        regnoElement.disabled = false;
      }
      return;
    }else{
      detailsElement.style.display = "block";
      detailsElement.innerHTML = `Registration Number must be an ${regLen}-digit number`;
      return;
    }
  }else{
    detailsElement.style.display = "block";
    detailsElement.innerHTML = `Please select your School`;
  }
}
// Update total display
function updateTotal() {
  totalPayElement.textContent = formatCurrency(totalPay);
}

// Show dues when button is clicked
async function showDues() {
  const school = document.getElementById('university').value;
  const regno = document.getElementById('regno').value.trim();

  // Basic validation
  if (!school || !regno) {
      notice('Please fill in all fields', "info");
      return;
  }
  if(regno.length < regLen){
    notice(`Registration Number must be an ${regLen}-digit Number`, "info");
    return;
  }

  // Reset UI
  totalPay = 0;
  updateTotal();

  // Debug missing metadata
  if(!profileDetails.universityId || !profileDetails.facultyId || !profileDetails.departmentId || !profileDetails.classId){
    console.error("Missing required profile details:", profileDetails);
    notice('Missing student profile information', "error");
    return;
  }

  try {
    const response = await fetch('/api/getClassDues', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        universityId: profileDetails.universityId,
        facultyId: profileDetails.facultyId,
        departmentId: profileDetails.departmentId,
        classId: profileDetails.classId.toLowerCase(), // Ensure lowercase
        regno: regno
      })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      notice(data.message || 'Failed to fetch dues', "error");
      return;
    }
    if (!data.data || data.data.length === 0) {
      notice('No dues found for this class', "info");
      return;
    }

    // Corrected: Process all dues
    data.data.forEach(due => {
      createDueItem(due);
    });

  } catch(error) {
    console.error("Dues fetch error:", error);
    notice('An error occurred while fetching dues', "error");
  }
}

// Create a due item element
function createDueItem(due) {
  console.log("Creating elemnt for this due:", due);
  const dueItem = document.createElement('div');
  dueItem.className = 'due-item';
  
  const dueHeader = document.createElement('div');
  dueHeader.className = 'due-header';
  
  const dueSelector = document.createElement('div');
  dueSelector.className = 'due-selector';
  let paymentDetails = "";

  const dueCode = document.createElement('div');
  dueCode.className = 'due-code';
  dueCode.textContent = due.id.toUpperCase();
  
  const dueName = document.createElement('div');
  dueName.className = 'due-name';
  dueName.textContent = due.name;
  
  const dueAmount = document.createElement('div');
  dueAmount.className = 'due-amount';
  dueAmount.textContent = formatCurrency(due.total);
  
  const toggleIcon = document.createElement('i');
  toggleIcon.id = "toggle-icon"
  toggleIcon.className = 'fas fa-chevron-down toggle-icon';

  const checkbox = document.createElement('input');
  checkbox.disabled = due.status == "active" ? false : true;
  checkbox.type = 'checkbox';
  checkbox.className = 'due-select';
  checkbox.id = `${due.id}-select`;
  checkbox.dataset.amount = due.total;
  checkbox.dataset.dueName = due.name;
  checkbox.dataset.id = due.id;
  checkbox.dataset.dueBatch = due.dueBatch;
  checkbox.addEventListener('change', function() {
      updateTotalAmount(this);
  });

  if (!due.paid) {
      dueSelector.appendChild(checkbox);
      dueSelector.app
  }else if(due.paid){
    if(due.isOneTime){
      const oneTimeBadge = document.createElement('span');
      oneTimeBadge.className = 'badge one-time';
      oneTimeBadge.textContent = 'One-Time';
      dueName.appendChild(oneTimeBadge);
    }else{
      dueSelector.appendChild(checkbox);
      dueSelector.app
    }
    paymentDetails = `
      <hr><br>
      <h3>Payment Details</h3>
      <p><strong>Transaction Reference:</strong> <span>${due.paymentDetails.TxId}</span></p>
      <p><strong>Batch:</strong> <span>${due.paymentDetails.dueBatch || "A"}</span></p>
      <p><strong>Paid on:</strong> <span>${toCentralISOString(due.paymentDetails.paidOn)}</span></p>`;

      const paidBadge = document.createElement('span');
      paidBadge.className = 'badge paid';
      paidBadge.textContent = 'PAID';
      dueName.appendChild(paidBadge);
  }

  const toggleContainer = document.createElement('div');
  toggleContainer.id = "toggle-container";
  toggleContainer.style.padding = "10px";
  toggleContainer.appendChild(toggleIcon);

  dueHeader.appendChild(dueSelector);
  dueHeader.appendChild(dueCode);
  dueHeader.appendChild(dueName);
  dueHeader.appendChild(dueAmount);
  dueHeader.appendChild(toggleContainer);
  
  const dueDetails = document.createElement('div');
  dueDetails.className = 'due-details';
  const time = toCentralISOString(due.createdAt);
  dueDetails.innerHTML = `
      <p><strong>Due Amount:</strong> <span>${formatCurrency(due.amount)}</span></p>
      <p><strong>Type:</strong> <span>${due.type.toUpperCase()}</span></p>
      <p><strong>Payment Status:</strong> <span class="payment-status ${due.paid ? 'paid' : 'unpaid'}">${due.paid ? 'PAID' : 'NOT PAID'}</span></p>
      <p><strong>Total Amount:</strong> <span>${formatCurrency(due.total)}</span></p>
      <p><strong>Due description:</strong> <span>${due.description}</span></p>
      <p><strong>Current Batch:</strong> <span>${due.dueBatch}</span></p>
      <p><strong>Compulsory:</strong> <span>${due.isCompulsory ? 'YES' : 'NO'}</span></p>
      <p><strong>Status:</strong> <span>${due.status}</span></p>
      <p><strong>Added on:</strong> <span>${time}</span></p>
  ${paymentDetails}`;
  dueItem.appendChild(dueHeader);
  dueItem.appendChild(dueDetails);
  duesContainer.appendChild(dueItem);

  toggleIcon.addEventListener('click', function() {
      dueDetails.style.display = dueDetails.style.display === 'block' ? 'none' : 'block';
      toggleIcon.classList.toggle('fa-chevron-down');
      toggleIcon.classList.toggle('fa-chevron-up');
  });
}

// Update total amount when checkbox is toggled
function updateTotalAmount(checkbox) {
  const dueAmount = parseFloat(checkbox.dataset.amount);
  const dueId = checkbox.dataset.id;
  const dueName = checkbox.dataset.dueName;
  const dueBatch = checkbox.dataset.dueBatch;
  if(checkbox.checked){
    totalPay = totalPay + dueAmount;
    cart.push({ dueId, dueName, dueAmount, dueBatch });
  }else{
    totalPay = totalPay - dueAmount;
    let position;
    cart.forEach(due => {
      if(due.dueId == dueId){
        position = cart.indexOf(due);
      }
    })
    if(position != -1){
      cart.splice(position, 1);
    }else{
      console.log("Fatal error occured as unselected item can't be realized!!");
      notice("Fatal error occured as unselected item can't be realized!!", "error");
    }
  }
  updateTotal();
}

// Proceed to checkout
function proceedToCheckout() {
  if (totalPay <= 0) {
      notice('Please select at least one due to proceed', "info");
      return;
  }
  initiatePayment(totalPay, profileDetails.regno, profileDetails.universityId, cart);
}


// Show dues when button is clicked
async function showLists() {
  const school = document.getElementById('university').value;
  const regno = document.getElementById('regno').value.trim();

  // Basic validation
  if (!school || !regno) {
      notice('Please fill in all fields', "info");
      return;
  }
  if(regno.length < regLen){
    notice(`Registration Number must be an ${regLen}-digit Number`, "info");
    return;
  }

  // Debug missing metadata
  if(!profileDetails.universityId || !profileDetails.facultyId || !profileDetails.departmentId || !profileDetails.classId){
    console.error("Missing required profile details:", profileDetails);
    notice('Missing student profile information', "error");
    return;
  }

  try {
    const response = await fetch('/api/getClassLists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        universityId: profileDetails.universityId,
        facultyId: profileDetails.facultyId,
        departmentId: profileDetails.departmentId,
        classId: profileDetails.classId.toLowerCase(), // Ensure lowercase
        regno: regno
      })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      notice(data.message || 'Failed to fetch lists', "error");
      return;
    }
    if (!data.data || data.data.length === 0) {
      notice('No lists found for this class', "info");
      return;
    }

    // Corrected: Process all dues
    data.data.forEach(list => {
      createListItem(list);
    });

  } catch(error) {
    console.error("Dues fetch error:", error);
    notice('An error occurred while fetching dues', "error");
  }
}

function createListItem(list) {
  console.log("Creating element for this list:", list);
  const listItem = document.createElement('div');
  listItem.className = 'due-item';

  const listHeader = document.createElement('div');
  listHeader.className = 'due-header';

  const listCode = document.createElement('div');
  listCode.className = 'due-code';
  listCode.textContent = list.id.toUpperCase();

  const listName = document.createElement('div');
  listName.className = 'due-name';
  listName.textContent = list.name;

  if (list.present) {
    const joinedBadge = document.createElement('span');
    joinedBadge.className = 'badge joined';
    joinedBadge.textContent = 'JOINED';
    listName.appendChild(joinedBadge);
  }

  const toggleIcon = document.createElement('i');
  toggleIcon.className = 'fas fa-chevron-down toggle-icon';
  toggleIcon.title = 'Click to expand';

  const toggleContainer = document.createElement('div');
  toggleContainer.id = "toggle-container";
  toggleContainer.style.padding = "10px";
  toggleContainer.appendChild(toggleIcon);

  listHeader.appendChild(listCode);
  listHeader.appendChild(listName);
  listHeader.appendChild(toggleContainer);

  const listDetails = document.createElement('div');
  listDetails.className = 'due-details';
  const createdTime = toCentralISOString(list.createdAt);

  listDetails.innerHTML = `
    <p><strong>Description:</strong> <span>${list.description || "No description available"}</span></p>
    <p><strong>Created on:</strong> <span>${createdTime}</span></p>
    <p><strong>Status:</strong> <span>${list.status || "Active"}</span></p>
  `;

  // Join Button (if not already joined)
  if (!list.present) {
    const joinBtn = document.createElement('button');
    joinBtn.className = 'join-list-btn';
    joinBtn.id = 'join-list';
    joinBtn.textContent = 'Join List';
    joinBtn.addEventListener('click', async function () {
      showLoad("show", 'join-list');

      try {
        const response = await fetch('/api/joinList', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            listId: list.id,
            regno: profileDetails.regno,
            universityId: profileDetails.universityId
          })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          notice(data.message || 'Failed to join list', "error");
          showLoad("hide", 'join-list');
          return;
        }

        notice('Successfully joined the list!', "success");
        showLoad("hide", 'join-list');
        // Update UI badge
        const badge = document.createElement('span');
        badge.className = 'badge joined';
        badge.textContent = 'JOINED';
        listName.appendChild(badge);
        joinBtn.remove(); // Remove button after joining
        list.present = true; // Local sync
      } catch (error) {
        console.error('Join list error:', error);
        notice('An error occurred while joining the list', "error");
        showLoad("hide", 'join-list');
      }
    });

    listDetails.appendChild(joinBtn);
  }

  listItem.appendChild(listHeader);
  listItem.appendChild(listDetails);
  listsContainer.appendChild(listItem);

  // Toggle logic
  toggleIcon.addEventListener('click', function () {
    listDetails.style.display = listDetails.style.display === 'block' ? 'none' : 'block';
    toggleIcon.classList.toggle('fa-chevron-down');
    toggleIcon.classList.toggle('fa-chevron-up');
  });
}


/**
 * Fetches, i.e populates the options.. 
 * @param {string} section - Either 'universities', 'faculties' or 'departments', it's simply what to fetch
 * @param {string} setElementId - ID of input selection element to update
 * @returns 
 */
async function updateOptions(setElementId, section) {
  const sectionElement = document.getElementById(setElementId);
  sectionElement.innerHTML = `<option value=''>Loading ${section}...</option>`;
  const payload = {section};
  payload.universityId = document.getElementById("university").value;
  payload.facultyId = document.getElementById("faculty")?.value || "";
  payload.departmentId = document.getElementById("department")?.value || "";
  await fetch("/api/getSection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload)
    })
    .then(async res => {
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Fetch failed");
      }
      return res.json();
    })
    .then(data => {
      sectionElement.innerHTML = "<option value=''>Select...</option>";
      sectionElement.disabled = false;
      if (!data.subSections?.length) {
          sectionElement.innerHTML = section == "faculties" ? "<option value=''> --No faculty found!-- </option>" : "<option value=''> --No department found!-- </option>";
        notice(`No ${section} found under selected parent.`, "info");
        return;
      }
      data.subSections.forEach(sub => {
          const option = document.createElement("option");
          option.value = section == "faculties"  ? sub.facultyId : section == "departments" ? sub.departmentId : section == "classes" ? sub.classId : sub.Id;
          option.textContent = section == "faculties"  ? sub.facultyName : section == "departments" ? sub.departmentName : section == "classes" ? sub.className : sub.name;
          sectionElement.appendChild(option);
          if(setElementId == "university"){
            allSchools[sub.id] = {
              "id": sub.id,
              "regLen": sub.regLen
            }
          }
        });
    })
    .catch(err => {
      console.error(err);
      notice(`Error fetching ${section}: ${err.message}`, "error");
    });
}


document.addEventListener("DOMContentLoaded",async function () {
    await updateOptions('university', 'universities');
    console.log("DOM fully loaded and parsed!");
  });  
  
document.getElementById("regno").addEventListener('change', function(){
  if(window.location.pathname == "/portal"){
    getProfile();
  }
});


window.runWindow = runWindow;
window.updateOptions = updateOptions;
window.assignLength = assignLength;
window.getProfile = getProfile;