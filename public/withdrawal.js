import { formatCurrency, makeRequest, notice, runWindow, showLoad, logout, toCentralISOString } from "./utility.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
let currentUser = null;


const withdrawalForm = document.getElementById('withdrawalForm');
const availableBalanceEl = document.getElementById('total-balance');
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
    if(data.details.disbursment){
        document.getElementById("disburse").hidden = false;
        document.getElementById("account-details").innerHTML =
        `<b>Account Name</b>: ${data.disbursementDetails.accountName}<br>
         <b>Account Number</b>: ${data.disbursementDetails.accountNumber}<br>
         <b>Bank</b>: ${data.disbursementDetails.bankName}<br>`;
    }else{
        populateBankSelect();
        document.getElementById("set-details").hidden = false;
        document.getElementById("accountNumber").addEventListener('change', async function(){
            const accountNumber = document.getElementById("accountNumber").value;
            console.log(`Account number lenght is : ${accountNumber.length}`);
            if(accountNumber.length == 10){
            await verifyAccountNumber(accountNumber);
            }
        });
    }
    // Load withdrawal history
    if(data.recentTransactions){
        populateTable((data.recentTransactions).reverse());
    }
    runWindow("close");
  } else {
    console.error("No user is signed in.");
    window.location.href = '/login.html';
  }
});

// Form submission handler
document.getElementById("initiate").addEventListener('submit', initiateWithdrawal);

async function initiateWithdrawal() {
    showLoad("show", "initiate");
    const amount = parseFloat(document.getElementById('amount').value);
    
    if (amount > currentBalance) {
        showNotice('Withdrawal amount exceeds available balance', 'error');
        return;
    }
    
    try {
        const response = await processWithdrawal(amount);
        const data = await response.json();
        renderWithdrawalHistory();
        if(data.success){
            notice(data.message, 'success');
        }else {
            notice(data.message || data.error, 'error');
        }
    } catch (error) {
        console.log('Withdrawal failed: ' + error, 'error');
    }finally{
        showLoad("hide", "initiate");
    }
}
async function populateBankSelect() {
    try {
        const response = await fetch("/banks.json"); // path relative to public folder
        const bankData = await response.json();

        if (bankData.status && Array.isArray(bankData.data)) {
        const select = document.getElementById("bankName");

        bankData.data.forEach(bank => {
            const option = document.createElement("option");
            option.value = bank.code; // 👈 Bank code as value
            option.textContent = bank.name; // 👈 Bank name as label
            select.appendChild(option);
        });
        } else {
        console.error("Invalid bank data format");
        }
    } catch (error) {
        console.error("Error loading banks:", error);
    }
}

async function verifyAccountNumber(accountNumber) {
    const bank = document.getElementById('bankName').value;
    
    if (!bank || !accountNumber || accountNumber.length !== 10) return;
    
    try {
        document.getElementById("accountName").value = "Validating Bank Account...";
        const response = await makeRequest(`https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bank}`, "GET",{}, {
            headers: {"Authorization": "Bearer sk_live_fd875d8523b31d4b8bb6d55c192461dff1b3c6e3"}
        });
        const data = await response.json();
        if(!response.ok){
            notice("Couldn't Validate Bank Account");
            document.getElementById("accountName").value = "Invalid Bank Account";
            return;
        }
        document.getElementById("accountName").value =   data.data.account_name;
        return;
    } catch (error) {
        notice('Could not verify account details. Please check and try again.', 'error');
    }
}

async function setWithdrawalAccount() {
    showLoad("show","setWithdrawalAccount");
    const accountNumber = document.getElementById("accountNumber").value;
    const bankCode = document.getElementById('bankName').value;
    let bankName = "";
    const accountName = document.getElementById("accountName").value;


    const response = await fetch("/banks.json"); // path relative to public folder
    const bankData = await response.json();
    bankData.data.forEach(bank => {
        if(bankCode == bank.code){
            bankName = bank.name;
        }
        return;
    });

    const payload = {
        accountNumber: accountNumber,
        accountName: accountName,
        bankCode: bankCode,
        bankName: bankName
    }
    try{
        const response = await makeRequest("/api/setWithdrawalAccount", "POST", payload);
        const data = await response.json();
        if(!response.ok){ 
            notice("An error occured!", "error");
            return;
        }
        if(!data.success){
            notice(data.message, "info");
            return;
        }
        notice(data.message, "success");
    }catch(err){
        notify(`An error occured: ${err}`, "error");
    }finally{
        showLoad("hide","setWithdrawalAccount");
    }
}

async function processWithdrawal(amount) {
    try{
        showLoad("show", "initiate")
        const response = await makeRequest("/api/makeWithdrawal", "POST", { amount });
        const data = await response.json();
        if(!response.ok){ 
            notice(data.error || data.message, "error");
            return;
        }
        if(!data.success){
            notice(data.message, "info");
            return;
        }
        notice(data.message, "success");
    }catch(err){
        notify(`An error occured: ${err}`, "error");
    }finally{
        showLoad("hide","initiate");
    }
}

function populateTable(records) {
  const TableBody = document.getElementById("TableBody");

  let tableHTML = "";

  records.forEach((record) => {
    if(record.type != "withdrawal") return;
    tableHTML += `
      <tr data-due-id="${record.TxId}">
        <td>${record.TxId}</td>
        <td>${formatCurrency(record.amount)}</td>
        <td>${formatCurrency(record.balanceBefore)}</td>
        <td>${formatCurrency(record.balanceAfter)}</td>
        <td style="color: ${record.status == "success" ? "green": record.status == "pending" ? "orange" : "brown"}"; text-stroke: 2px black; font-weight: 800;">${record.status.toUpperCase()}</td>
        <td>${toCentralISOString(record.createdAt)}</td>
      </tr>
    `;
  });
  
  TableBody.innerHTML = tableHTML;

  /*
  document.querySelectorAll('.btn-view').forEach(btn => {
    btn.addEventListener('click', (e) => viewMember(e.target.dataset.id));
  });

  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => editMember(e.target.dataset.id));
  });*/
}

window.logout = logout;
window.setWithdrawalAccount = setWithdrawalAccount;
window.initiateWithdrawal = initiateWithdrawal;