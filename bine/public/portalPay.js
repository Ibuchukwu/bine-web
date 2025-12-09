import { runWindow, formatCurrency, notice, showLoad } from "./utility.js";

let paymentPollInterval;
let expiryTimer;
let nubanDetails;

function createPaymentModal(virtualAccount) {
  return `
    <div class="payment-modal">
      <div class="payment-header">
        <h3><i class="fas fa-wallet"></i> Complete Payment</h3>
        <button class="close-btn" onclick="runWindow('hide')">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="payment-body">
        <div class="account-details">
          <div class="detail-row">
            <span class="label">Bank Name:</span>
            <span class="value">${virtualAccount.bankName}</span>
          </div>
          <div class="detail-row">
            <span class="label">Account Number:</span>
            <span class="value copyable" onclick="copyToClipboard('${virtualAccount.accountNumber}')">
              ${virtualAccount.accountNumber}
              <i class="far fa-copy"></i>
            </span>
          </div>
          <div class="detail-row">
            <span class="label">Account Name:</span>
            <span class="value">${virtualAccount.accountName}</span>
          </div>
          <div class="detail-row">
            <span class="label">Amount:</span>
            <span class="value">${formatCurrency(virtualAccount.amount)}</span>
          </div>
          <div class="detail-row">
            <span class="label">Expires In:</span>
            <span class="value" id="expiry-timer">15:00</span>
          </div>
        </div>
        
        <div class="payment-instructions">
          <h4><i class="fas fa-info-circle"></i> Payment Instructions</h4>
          <ol>
            <li>Transfer the <b>EXACT</b> amount to the account above</li>
            <li>Payment will be verified automatically within 15 minutes</li>
            <li>Do not close this window until payment is confirmed</li>
          </ol>
        </div>
        
        <div class="payment-status">
          <div class="status-indicator pending">
            <i class="fas fa-circle-notch fa-spin"></i>
            <span>Waiting for payment...</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
        </div>
      </div>
      
      <div class="payment-footer">
        <button class="btn btn-secondary" id="cancel-payment" onclick="cancelCurrentPayment(this)">
          Cancel Payment
        </button>
        <button class="btn btn-primary" id="manual-verify" onclick="verifyPaymentManually(this)">
          I've Paid
        </button>
      </div>
    </div>
  `;
}

export async function initiatePayment(totalAmount, regno, universityId, cart) {
    runWindow("load","");
  try {
    // 1. Generate virtual account
    const response = await fetch('/api/getPortalPayment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: totalAmount,
        regno,
        universityId,
        cart
      })
    });

    const { success, accountDetails, TxId } = await response.json();
    nubanDetails = accountDetails;
    sessionStorage.setItem('currentPayment', JSON.stringify(accountDetails));
    if (!success) throw new Error('Failed to generate payment details');

    // 2. Show payment modal
    accountDetails.amount = totalAmount;
    runWindow('show', createPaymentModal(accountDetails));
    startExpiryTimer(accountDetails.delay || 900);
    startPaymentPolling(accountDetails.accountNumber);
    console.time('paymentProcessing');
    
  } catch (error) {
    console.error('Payment initiation failed:', error);
    notice('Payment initiation failed. Please try again.', 'error');
  }
}

function startExpiryTimer(seconds) {
  clearInterval(expiryTimer);
  const expiryElement = document.getElementById('expiry-timer');
  
  expiryTimer = setInterval(() => {
    const mins = parseInt(Math.floor(seconds / 60));
    const secs = parseInt(seconds - (mins * 60));
    const timeLeft = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    console.log(timeLeft);
    expiryElement.textContent = timeLeft;
    if (seconds <= 0) {
      clearInterval(expiryTimer);
      expiryElement.textContent = "Expired!";
      expiryElement.style.color = "var(--error-color)";
      stopPaymentPolling();
    }
    seconds--;
  }, 1000);
}

function startPaymentPolling(payment) {
  clearInterval(paymentPollInterval);
  
  paymentPollInterval = setInterval(async () => {
    try {
      const response = await fetch(`/api/checkPaymentStatus/${payment}`);
      const status = await response.json();
      
      if (status.status === 'success') {
        paymentCompleted();
      } else if (status.status === 'failed') {
        paymentFailed();
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 10000); // Poll every 10 seconds
}

// Add to portalPay.js
async function verifyPaymentManually(element) {
  try {
      showLoad("show", element.id);
      const response = await fetch(`/api/checkPaymentStatus/${nubanDetails.accountNumber}`);
      const status = await response.json();
      
      if (status.status === 'success') {
        notice('Payment Confirmed!', 'success');
        paymentCompleted();
        showLoad("hide", element.id);
      } else {
        notice('Awaiting payment...', 'success');
        showLoad("hide", element.id);
      }
    } catch (error) {
    notice('Manual verification failed', 'error');
    showLoad("hide", element.id);
  }
}

function stopPaymentPolling() {
  clearInterval(paymentPollInterval);
}

function paymentCompleted() {
  clearInterval(paymentPollInterval);
  clearInterval(expiryTimer);
  
  // Update UI
  document.querySelector('.status-indicator').innerHTML = `
    <i class="fas fa-check-circle"></i>
    <span>Payment Verified!</span>
  `;
  document.querySelector('.status-indicator').className = 'status-indicator success';
  document.querySelector('.progress-fill').style.animation = 'none';
  document.querySelector('.progress-fill').style.width = '100%';
  document.querySelector('.progress-fill').style.background = 'var(--success-color)';
  
  // Disable buttons
  document.querySelector('.payment-footer').innerHTML = `
    <button class="btn btn-primary" onclick="runWindow('hide'); location.reload()">
      <i class="fas fa-check"></i> Done
    </button>
  `;
  
  console.timeEnd('paymentProcessing'); 
  notice('Payment successfully verified!', 'success');
}

function paymentFailed() {
  clearInterval(paymentPollInterval);
  
  document.querySelector('.status-indicator').innerHTML = `
    <i class="fas fa-times-circle"></i>
    <span>Payment Verification Failed</span>
  `;
  document.querySelector('.status-indicator').className = 'status-indicator failed';
  console.timeEnd('paymentProcessing'); 
  notice('Payment verification failed. Please contact support.', 'error');
}

// portalPay.js
async function cancelCurrentPayment(element) {
  try {
    showLoad("show", element.id);
    const response = await fetch('/api/cancelPayment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountNumber: nubanDetails.accountNumber
      })
    });
    
    const result = await response.json();
    if (result.success) {
      showLoad("hide", element.id);
      stopPaymentPolling();
      notice('Payment cancelled', 'success');
      runWindow('hide');
    } else {
      showLoad("hide", element.id);
      notice(result.message, 'error');
    }
  } catch (error) {
    notice('Cancellation failed', 'error');
  }
}

// Utility function
function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  notice('Copied to clipboard!', 'success');
}

window.cancelCurrentPayment = cancelCurrentPayment;
window.copyToClipboard = copyToClipboard;
window.runWindow = runWindow;
window.verifyPaymentManually = verifyPaymentManually;