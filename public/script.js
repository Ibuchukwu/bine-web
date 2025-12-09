import { notice, runWindow } from "./notice.js";
import { app, analytics } from './firebase.js';

// Dues Data
const dues = {
    "gst111": {
        id: "gst111",
        type: "text",
        name: "GST 111 TextBook (English Language) with Manual",
        cost: 4700,
        charge: 0,
        notes: "",
        paid: true,
        createdAt: "2025-04-01T10:00:00Z"
    },
    "gst103": {
        id: "gst103",
        type: "text",
        name: "GST 103 TextBook (Philosophy) with Manual",
        cost: 3700,
        charge: 0,
        notes: "",
        paid: false,
        createdAt: "2025-04-05T12:00:00Z"
    },
    "crdues": {
        id: "crdues",
        type: "bill",
        name: "Course Representatives Dues for 2nd semester",
        cost: 1300,
        charge: 0,
        notes: "",
        paid: false,
        createdAt: "2025-04-10T09:30:00Z"
    },
    "sugcl": {
        id: "sugcl",
        type: "text",
        name: "GST 103 TextBook (Philosophy) with Manual",
        cost: 3700,
        charge: 0,
        notes: "",
        paid: false,
        createdAt: "2025-04-12T14:15:00Z"
    }
};

let totalPay = 0;

// Format currency
function formatCurrency(amount) {
    return amount.toLocaleString('en-NG', {
        style: 'currency',
        currency: 'NGN'
    });
}

// Update total display
function updateTotal() {
    document.getElementById('totalPay').textContent = formatCurrency(totalPay);
}

// Toggle due details
function toggleDetails(detailsElement) {
    if (detailsElement.style.display === "none" || detailsElement.style.display === "") {
        detailsElement.style.display = "block";
    } else {
        detailsElement.style.display = "none";
    }
}

// Show dues
function showDues() {
    const regno = document.getElementById("regNo").value;
    if(regno.length >= 10){
        notice(`Your Registration Number is ${regno}`, "success");
    }else{
        notice("Incomplete Reg No.!", "error");
        console.log('Incomplete Reg No!');
    }
    const duesSection = document.getElementById('duesSection');
    const duesContainer = document.getElementById('duesContainer');
    duesContainer.innerHTML = '';
    totalPay = 0;
    updateTotal();
    duesSection.classList.remove('hidden');
    try{
        Object.values(dues).forEach(due => {
        const dueItem = document.createElement('div');
        dueItem.className = 'due-item';

        const dueHeader = document.createElement('div');
        dueHeader.className = 'due-header';

        const dueTitle = document.createElement('div');
        dueTitle.innerHTML = `<strong>${due.id.toUpperCase()}</strong>: ${due.name}`;

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = 'Details';
        toggleBtn.style.width = 'auto';
        toggleBtn.style.padding = '5px 10px';
        toggleBtn.style.fontSize = '0.9rem';
        toggleBtn.style.marginTop = '0';
        toggleBtn.addEventListener('click', () => toggleDetails(dueDetails));

        dueHeader.appendChild(dueTitle);
        dueHeader.appendChild(toggleBtn);

        const dueDetails = document.createElement('div');
        dueDetails.className = 'due-details';

        const amount = document.createElement('p');
        amount.innerHTML = `<strong>Amount:</strong> ${formatCurrency(due.cost)}`;

        const date = document.createElement('p');
        const createdAt = new Date(due.createdAt);
        date.innerHTML = `<strong>Added on:</strong> ${createdAt.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}`;

        const type = document.createElement('p');
        type.innerHTML = `<strong>Type:</strong> ${due.type.toUpperCase()}`;

        const paid = document.createElement('p');
        paid.innerHTML = `<strong>Status:</strong> ${due.paid ? "Paid ✅" : "Unpaid ❌"}`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.disabled = due.paid;
        checkbox.checked = due.paid;

        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                totalPay += due.cost;
            } else {
                totalPay -= due.cost;
            }
            updateTotal();
        });

        dueDetails.appendChild(amount);
        dueDetails.appendChild(date);
        dueDetails.appendChild(type);
        dueDetails.appendChild(paid);

        dueItem.appendChild(dueHeader);
        dueItem.appendChild(checkbox);
        dueItem.appendChild(dueDetails);

        duesContainer.appendChild(dueItem);
        
    });
    }catch(error){
        console.log(`An error occured! : ${error}`);
    }
}

// Handle checkout (basic alert for now)
function handleCheckout() {
if (totalPay === 0) {
alert("Please select at least one due to pay.");
} else {
alert(`You are about to pay ${formatCurrency(totalPay)}. Proceeding to checkout...`);
// Place your checkout logic here (e.g., redirect, payment API, etc.)
}
    
document.getElementById('checkoutBtn').addEventListener('click', handleCheckout);
}

// Event Listeners
document.getElementById('showDuesBtn').addEventListener('click', showDues);
