import { auth } from "./firebase.js";
import { formatCurrency, notice, runWindow, toCentralISOString } from "./utility.js";
import { signOut , onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";

let userId;
let userDisplayName;
runWindow("load","");
//connectAuthEmulator(auth, "http://localhost:9099");

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
                if (!data.details.profileVerified) {
                  const modalContent = `
                    <div style="text-align: center; padding: 20px;">
                      <h2 style="color: #FFC107; margin-bottom: 15px;">Account Verification Pending</h2>
                      <p style="font-size: 1.1em; line-height: 1.6; margin-bottom: 30px;">
                        We're yet to verify this account. Kindly be patient!
                        <br>
                        You will now be logged out. Please try again once your account has been verified.
                      </p>
                      <button id="logoutBtn" style="background-color: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 1em;">
                        Okay
                      </button>
                    </div>
                  `;

                  runWindow("open", modalContent, { closeButton: false }, true);

                  // Add event listener to the "Okay" button
                  document.getElementById("logoutBtn").addEventListener("click", logout);
                  setTimeout(() => {
                    logout;
                  }, 5000);
                  return;
                }
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
                const user = { class: data.details.className, department: data.details.departmentName };
                sessionStorage.setItem("user", JSON.stringify(user));
                document.getElementById("total-balance").textContent = parseFloat(data.details.mainBalance).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
                runWindow("close",);
            }else if(!data.success || !response.ok){
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
  if(transaction.type == "due_payment"){
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
  }else if(transaction.type == "withdrawal"){
    const transactionItem = document.createElement('div');
    transactionItem.className = 'due-item';
    
    const transactionHeader = document.createElement('div');
    transactionHeader.className = 'due-header';
    
    const transactionRef = document.createElement('div');
    transactionRef.className = 'due-code';
    transactionRef.textContent = transaction.TxId;

    const transactionAmount = document.createElement('div');
    transactionAmount.className = 'due-amount'; // This div will show the initial amount
    transactionAmount.style.color = "brown"
    transactionAmount.textContent = `-${formatCurrency(transaction.amount + transaction.charge)}`;

    //const settledTransactionAmountHeader = document.createElement('div'); 
    //settledTransactionAmountHeader.className = 'due-amount';
    //settledTransactionAmountHeader.textContent = formatCurrency(transaction.settledAmount);
    
    const toggleIcon = document.createElement('i');
    toggleIcon.id = "toggle-icon"
    toggleIcon.className = 'fas fa-chevron-down toggle-icon';
    
    const transactionName = document.createElement('div');
    transactionName.className = 'due-name';
    transactionName.textContent = `Withdrawal of ${formatCurrency(transaction.amount)} on ${toCentralISOString(transaction.createdAt)}`;

    transactionHeader.appendChild(transactionRef);
    transactionHeader.appendChild(transactionName);
    transactionHeader.appendChild(transactionAmount);
    transactionHeader.appendChild(toggleIcon);
    const transactionDetails = document.createElement('div');
    transactionDetails.className = 'due-details';
    
    transactionDetails.innerHTML = `
        
        <p><strong>Transaction Amount:</strong> <span>${formatCurrency(transaction.amount)}</span></p>
        <p><strong>Type:</strong> <span>${(transaction.type)}</span></p>
        <p><strong>transaction Charge:</strong> <span>${formatCurrency(transaction.charge)}</span></p>
        <p><strong>Balance Before:</strong> <span>${formatCurrency(transaction.balanceBefore)}</span></p>
        <p><strong>Balance After:</strong> <span>${formatCurrency(transaction.balanceAfter)}</span></p>
        <p><strong>Transaction Status:</strong> <span>${transaction.status.toUpperCase()}</span></p>
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

