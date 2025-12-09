import { auth } from "./firebase.js";
import { formatCurrency, notice, runWindow, toCentralISOString } from "./utility.js";
import { signOut , onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";

let userId;
let userDisplayName;
runWindow("load","");
connectAuthEmulator(auth, "http://localhost:9099");

const transactionsContainer = document.getElementById('transactions-container');
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log(user);
      if(window.location.pathname == "/dashboard"){
      userId = user.uid;
      userDisplayName = user.displayName;
      document.getElementById('currentUser').innerHTML = `> Signed in as <b>${userDisplayName}</b>.`;
        try {
            const token = await user.getIdToken();
            const response = await fetch("/api/dashboard", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            const data = await response.json();
            if(data.success){
                const transactions = data.recentTransactions;
                if(transactions == [] || transactions.length == 0){
                  createtransactionItem(0);
                }else{
                  transactionsContainer.innerHTML = "";
                  const processedArray = transactions.reverse();
                  processedArray.forEach(transaction => {
                    createtransactionItem(transaction);
                  });
                }
                document.getElementById("className").textContent = data.details.className;
                document.getElementById("departmentName").textContent = data.details.departmentName;
                document.getElementById("total-balance").textContent = parseFloat(data.details.mainBalance).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
                runWindow("close",);
            }else if(!data.success){
                window.location.href = "setup.html";
            } else {
                notice(`Error Loading dashboard.. Kindly Reload page!`, "error");
                console.warn("Error occured in response", data);
            }
        } catch (error) {
          console.error("Error loading dashboard:", error);
        }
      }else if(window.location.pathname == "/allStudentsProfiles"){
        //nbjhv
      }
      runWindow("close",);
    } else {
      console.error("No user is signed in.");
      notice("No user is signed in.", "error");
      window.location.href = '/login.html';
    }
  });


function createtransactionItem(transaction) {
  if(transaction == 0){
    transactionsContainer.style.display = "block";
    transactionsContainer.innerHTML = `
        <div colspan="7" class="empty-state">
          <i class="fas fa-clipboard-list"></i>
          <h3>No Recent Transactions</h3>
        </div>
    `;
    return;
  }
  console.log("Creating elemnt for this transaction:", transaction);
  const transactionItem = document.createElement('div');
  transactionItem.className = 'due-item';
  
  const transactionHeader = document.createElement('div');
  transactionHeader.className = 'due-header';
  
  const transactionRef = document.createElement('div');
  transactionRef.className = 'due-code';
  transactionRef.textContent = transaction.TxId;

  const transactionAmount = document.createElement('div');
  transactionAmount.className = 'due-amount'; // This div will show the initial amount
  transactionAmount.textContent = formatCurrency(transaction.amount);

  const settledTransactionAmountHeader = document.createElement('div'); 
  settledTransactionAmountHeader.className = 'due-amount';
  settledTransactionAmountHeader.textContent = formatCurrency(transaction.settledAmount);
  
  const toggleIcon = document.createElement('i');
  toggleIcon.id = "toggle-icon"
  toggleIcon.className = 'fas fa-chevron-down toggle-icon';
  
  const transactionName = document.createElement('div');
  transactionName.className = 'due-name';
  transactionName.textContent = `Payment by ${transaction.subjectName}`;

  transactionHeader.appendChild(transactionRef);
  transactionHeader.appendChild(transactionName);
  transactionHeader.appendChild(transactionAmount);
  transactionHeader.appendChild(toggleIcon);

  const cart = transaction.prePayment.pendingPaymentData.cart;
  cart.reverse();
  let content = "Paid for ";

  if (cart.length === 1) {
    content += cart[0].dueName;
  } else {
    cart.forEach((item, index) => {
      if (index === cart.length - 1) {
        content += `and ${item.dueName}`;
      } else if (index === cart.length - 2) {
        content += `${item.dueName} `;
      } else {
        content += `${item.dueName}, `;
      }
    });
  }



  transaction.description = content;
  const transactionDetails = document.createElement('div');
  transactionDetails.className = 'due-details';
  
  transactionDetails.innerHTML = `
      <p><strong>Payment from:</strong> <span>${transaction.subjectName}</span></p>
      <p><strong>Transaction Amount:</strong> <span>${formatCurrency(transaction.amount)}</span></p>
      <p><strong>Type:</strong> <span>${(transaction.type)}</span></p>
      <p><strong>transaction Charge:</strong> <span>${formatCurrency(transaction.charge)}</span></p>
      <p><strong>Settled Amount:</strong> <span>${formatCurrency(transaction.settledAmount)}</span></p>
      <p><strong>transaction description:</strong> <span>${transaction.description}</span></p>
      <p><strong>Made on:</strong> <span>${toCentralISOString(transaction.createdAt)}</span></p>`;
  transactionItem.appendChild(transactionHeader);
  transactionItem.appendChild(transactionDetails);
  transactionsContainer.appendChild(transactionItem);

  toggleIcon.addEventListener('click', function() {
      transactionDetails.style.display = transactionDetails.style.display === 'block' ? 'none' : 'block';
      toggleIcon.classList.toggle('fa-chevron-down');
      toggleIcon.classList.toggle('fa-chevron-up');
  });
}

function logout() {
    signOut(auth)
      .then(() => {
        notice("Log Out Successful", "success")
        setTimeout(function(){
            window.location.href = 'login.html';
        }, 4000);
      })
      .catch((error) => {
        // Handle errors
        notice('Error logging out:', "error");
        console.error('Error logging out:', error);
      });
  }

window.logout = logout;

