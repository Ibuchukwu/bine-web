import { formatCurrency, makeRequest, notice, runWindow, showLoad } from "./utility.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
connectAuthEmulator(auth, "http://localhost:9099");
let currentUser = null;


const withdrawalForm = document.getElementById('withdrawalForm');
const availableBalanceEl = document.getElementById('total-balance');
const accountNameEl = document.getElementById('accountName');
const withdrawalHistoryEl = document.getElementById('withdrawalHistory');

// Global Variables
let currentBalance = 0;
let withdrawalHistory = [];
runWindow("load");

onAuthStateChanged(auth, async (User) => {
  if (User) {
    const response = await makeRequest("/api/dashboard", "POST", {});
    if (!response.ok){
        runWindow("close"); 
        notice(`An error occured, Please try again!`,"error");
        return;
    }
    const data = await response.json();
    currentBalance = data.details.mainBalance;
    availableBalanceEl.textContent = `${formatCurrency(currentBalance)}`;
    if(data.details.disbursmentReady){
        document.getElementById("disburse").hidden = false;
    }else{
        document.getElementById("set-details").hidden = false;
    }
    // Load withdrawal history
    await loadWithdrawalHistory();
    runWindow("close");
  } else {
    console.error("No user is signed in.");
    if(window.location.pathname != '/login' && window.location.pathname != '/signup'){
      notice("No user is signed in.", "error");
      window.location.href = '/login.html';
    }
  }
});


function setWithdrawalAccount(){
    const bankName = document.getElementById("bankName")
}

// Form submission handler
withdrawalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(withdrawalForm);
    const amount = parseFloat(formData.get('amount'));
    
    if (amount > currentBalance) {
        showNotice('Withdrawal amount exceeds available balance', 'error');
        return;
    }
    
    try {
        // Process withdrawal
        const response = await processWithdrawal(formData);
        
        // Update UI
        currentBalance -= amount;
        availableBalanceEl.textContent = `₦${currentBalance.toLocaleString()}`;
        withdrawalHistory.unshift(response.data);
        renderWithdrawalHistory();
        
        showNotice('Withdrawal request submitted successfully!', 'success');
        withdrawalForm.reset();
    } catch (error) {
        showNotice('Withdrawal failed: ' + error.message, 'error');
    }
});

// Verify account number with bank
async function verifyAccountNumber() {
    const bank = document.getElementById('bankName').value;
    const accountNumber = document.getElementById('accountNumber').value;
    
    if (!bank || !accountNumber || accountNumber.length !== 10) return;
    
    try {
        // Call bank verification API
        const accountDetails = await verifyBankAccount(bank, accountNumber);
        accountNameEl.value = accountDetails.account_name;
    } catch (error) {
        accountNameEl.value = '';
        showNotice('Could not verify account details. Please check and try again.', 'error');
    }
}

// Load withdrawal history
async function loadWithdrawalHistory() {
    try {
        const response = await getWithdrawalHistory();
        withdrawalHistory = response.data;
        renderWithdrawalHistory();
    } catch (error) {
        showNotice('Error loading withdrawal history', 'error');
    }
}

// Render withdrawal history table
function renderWithdrawalHistory() {
    if (withdrawalHistory.length === 0) {
        withdrawalHistoryEl.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">No withdrawal history yet</td>
            </tr>
        `;
        return;
    }
    
    withdrawalHistoryEl.innerHTML = withdrawalHistory.map(withdrawal => `
        <tr>
            <td>${new Date(withdrawal.date).toLocaleDateString()}</td>
            <td>₦${withdrawal.amount.toLocaleString()}</td>
            <td>${withdrawal.bankName}</td>
            <td><span class="status-badge ${getStatusClass(withdrawal.status)}">${withdrawal.status}</span></td>
            <td class="actions-cell">
                <i class="fas fa-eye view-icon action-icon" title="View Details"></i>
                ${withdrawal.status === 'pending' ? 
                  '<i class="fas fa-times-circle delete-icon action-icon" title="Cancel Request"></i>' : ''}
            </td>
        </tr>
    `).join('');
}

// Helper function to get status CSS class
function getStatusClass(status) {
    switch(status.toLowerCase()) {
        case 'completed': return 'status-active';
        case 'pending': return 'status-pending';
        case 'failed': return 'status-inactive';
        default: return '';
    }
}

// Reset form
function resetForm() {
    withdrawalForm.reset();
    accountNameEl.value = '';
}

// API Functions (Placeholders - Implement with actual API calls)
async function getClassFunds() {
    // Replace with actual API call
    return { availableBalance: 150000 };
}

async function getWithdrawalHistory() {
    // Replace with actual API call
    return { data: [] };
}

async function processWithdrawal(formData) {
    // Replace with actual API call
    return { 
        data: {
            date: new Date().toISOString(),
            amount: parseFloat(formData.get('amount')),
            bankName: formData.get('bankName'),
            status: 'pending',
            purpose: formData.get('purpose')
        }
    };
}

async function verifyBankAccount(bankCode, accountNumber) {
    // Replace with actual bank verification API call
    return { account_name: "Verified Account Name" };
}

// Utility function to show notices
function showNotice(message, type = 'info') {
    // Implement your notice/alert system
    console.log(`${type}: ${message}`);
}