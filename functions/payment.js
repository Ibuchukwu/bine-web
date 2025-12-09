
const functions = await import('firebase-functions');
// Helper function to validate NUBAN structure
function isValidNuban(nuban) {
  return (
    typeof nuban === 'object' && 
    nuban !== null &&
    typeof nuban.accountNumber === 'string' && 
    typeof nuban.accountName === 'string' && 
    typeof nuban.bankName === 'string'
  );
}

// Mock payment gateway verification (replace with real implementation)
function verifyWebhookSignature(headers, body, secret) {
    // Implement real verification in production
    /*if (process.env.NODE_ENV === 'production' && !realSignatureCheck) {
    throw new Error("Invalid signature");
    }*/
  // In production: Verify actual payment gateway signature
  // This is a mock for emulator testing
  if (process.env.NODE_ENV === 'production') {
    const signature = headers['x-payment-signature'];
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(JSON.stringify(body)).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  }
  return true; // Bypass verification in development
}

export async function addnuban(request, reply) {
    try {
        const { admin, db } = await import ('./firebaseServices.js');
        const Joi = (await import('joi')).default;
        const schema = Joi.object({
            bankName: Joi.string().required(),
            accountNumber: Joi.string().required(),
            accountName: Joi.string().required()
        });

        const { error } = schema.validate(request.body);
        if (error) {
            return reply.code(400).send({ 
                success: false, 
                message: error.details[0].message 
            });
        }

        const { bankName, accountNumber, accountName } = request.body;
        const newNuban = {
            accountNumber,
            accountName,
            bankName,
            available: 1
        };
        
        const nubanRef = db.collection("meta").doc("nubans");
        
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(nubanRef);
            const existing = doc.data()?.all || [];
            
            if (existing.some(n => n.accountNumber === accountNumber)) {
                throw new Error("NUBAN already exists");
            }
            
            transaction.set(nubanRef, {
                all: admin.firestore.FieldValue.arrayUnion(newNuban),
                available: admin.firestore.FieldValue.arrayUnion(newNuban)
            }, {merge: true});
        });

        return reply.code(200).send({
            success: true,
            message: "New NUBAN successfully added!"
        });

    } catch (error) {
        console.error("Error adding NUBAN:", error);
        return reply.code(500).send({
            success: false,
            message: error.message || "Failed to add NUBAN",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

export async function getPortalPayment(request, reply) {
    try {
        const { admin, db } = await import ('./firebaseServices.js');
        const { getClassDetailsByregno, getUnCharge, newTransaction, toCentralISOString } = await import("./utils.js");
        const Joi = (await import('joi')).default;
        const schema = Joi.object({
            amount: Joi.number().min(10).required(), // Minimum amount validation
            regno: Joi.string().pattern(/^[A-Z0-9]+$/).required(),
            universityId: Joi.string().required(),
            cart: Joi.array().required()
        });

        const { error, value } = schema.validate(request.body);
        if (error) {
            return reply.code(400).send({ 
                success: false, 
                message: error.details[0].message 
            });
        }

        const TxId = newTransaction(value.regno);
        const nubanRef = db.collection("meta").doc("nubans");
        const studentName = (await db.collection("schools").doc(value.universityId)
                              .collection("studentProfiles").doc(value.regno).get()).data().name;
        
        const result = await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(nubanRef);
            const availableNubans = doc.data()?.available || [];
            
            if (availableNubans.length === 0) {
                generateNUBANS();
                throw new Error("No available NUBANs at this time, Please try again");
            }
            if (availableNubans.length < 5) {
                generateNUBANS();
            }
            
            const nuban = availableNubans[0];
            if (!isValidNuban(nuban)) {
                throw new Error("Invalid NUBAN format in database");
            }
            
            // Remove from available
            transaction.update(nubanRef, {
                available: admin.firestore.FieldValue.arrayRemove(nuban)
            });
            
            // Create payment record
            const paymentData = {
                amount: value.amount,
                cart: value.cart,
                accountDetails: nuban,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                expiresAt: new Date(Date.now() + 15 * 60000), // 15 mins
                status: 'pending',
                regno: value.regno,
                studentName: studentName,
                universityId: value.universityId,
                lastChecked: null,
                TxId
            };
            transaction.set(db.collection('pendingPayments').doc(nuban.accountNumber), paymentData);
            
            return { nuban, TxId };
        });

        return reply.code(200).send({
            success: true,
            accountDetails: {
                accountNumber: result.nuban.accountNumber,
                accountName: result.nuban.accountName,
                bankName: result.nuban.bankName,
                amount: value.amount,
                expiresIn: new Date(Date.now() + 15 * 60000),
                delay: 900
            },
            TxId: result.TxId
        });

    } catch (error) {
        console.error("Payment initiation error:", error);
        return reply.code(500).send({
            success: false,
            message: error.message || "Payment initiation failed",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

export async function paymentWebhook(request, reply) {
  try {
    const { logger } = functions;
    const { getUnCharge } = await import("./utils.js");
    const Joi = (await import('joi')).default;


    const xff = request.headers["x-forwarded-for"];
    const IP1 = xff ? xff.split(",")[0].trim() : request.ip;
    const IP2 = xff ? xff.split(",")[1].trim() : request.ip;

    // 2. Optionally log or monitor the IP
    logger.info("Client IP:", {
        ip1: IP1,
        ip2: IP2
    });
    const webhookIP1 = process.env.BILLSTACK_IP1;
    const webhookIP2 = process.env.BILLSTACK_IP2;
    const ipCheck = IP1 == webhookIP2 ? true : false;
    if (!ipCheck) {
      logger.warn("IP Mismatch! Invalid Signature",{
        ipCheck: ipCheck,
        IP1: IP1,
        IP2: IP2,
        webhookIP1: webhookIP1,
        webhookIP2: webhookIP2
      });
      return reply.code(401).send({ success: false, message: "Invalid webhook signature" });
    }

    const notification = request.body;
    logger.info("Webhook notification received", { notification });

    const payload = {
      accountNumber: notification?.data?.account?.account_number,
      amount: notification?.data?.amount,
      status: "success",
      timestamp: notification?.data?.created_at
    };

    // Validate payload
    const schema = Joi.object({
      accountNumber: Joi.string().required(),
      amount: Joi.number().positive().required(),
      status: Joi.string().valid('success', 'failed').required(),
      timestamp: Joi.required()
    });

    const { error, value } = schema.validate(payload);
    if (error) {
      return reply.code(400).send({ success: false, message: error.details[0].message });
    }

    logger.info("Webhook payload validated successfully", { value });

    const response = await processPendingPayment(value, request.body, logger);
    return reply.code(response.code).send(response.body);

  } catch (error) {
    console.error("Webhook processing error:", error);
    return reply.code(500).send({
      success: false,
      message: "Webhook processing failed",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export async function processPendingPayment(value, gatewayResponse, logger) {
  const { admin, db } = await import('./firebaseServices.js');
  const { getClassDetailsByregno, getUnCharge, toCentralISOString } = await import("./utils.js");

  const paymentRef = db.collection('pendingPayments').doc(value.accountNumber);
  const companyMetricsRef = db.collection("company").doc("metrics");

  let pendingPaymentData;
  const paymentDoc = await paymentRef.get();

  if (!paymentDoc.exists) {
    logger.warn(`Pending payment for NUBAN ${value.accountNumber} not found at ${toCentralISOString(Date.now())}`);
    return {
      code: 200,
      body: { success: true, message: "Payment record not found" }
    };
  }

  pendingPaymentData = paymentDoc.data();

  if (pendingPaymentData.status !== 'pending') {
    logger.warn("Payment already processed", { accountNumber: value.accountNumber });
    return {
      code: 200,
      body: { success: true, message: "Payment already processed" }
    };
  }

  const principalAmount = value.amount;
  const expectedAmount = pendingPaymentData.amount;
  const underpay = expectedAmount - principalAmount;

  if (underpay > 0) {
    // Notify or handle underpayment
    const classDetails = (await getClassDetailsByregno(pendingPaymentData.regno, pendingPaymentData.universityId)).details;
    processWrongPay("underpay", underpay, pendingPaymentData.regno, classDetails);
    logger.warn(`Underpayment detected: ₦${underpay}`, {
      regno: pendingPaymentData.regno,
      classDetails
    });

    return {
      code: 401,
      body: { success: false, message: `Payment underpaid by ₦${underpay}. Cannot process.` }
    };
  }else if (underpay < 0) {
    // Notify or handle overpayment
    const classDetails = (await getClassDetailsByregno(pendingPaymentData.regno, pendingPaymentData.universityId)).details;
    processWrongPay("overpay", (underpay * -1), pendingPaymentData.regno, classDetails);
    logger.warn(`Overpayment detected: ₦${underpay}`, {
      regno: pendingPaymentData.regno,
      classDetails
    });

    return {
      code: 401,
      body: { success: false, message: `Payment overpaid by ₦${underpay * -1}. Cannot process.` }
    };
  }

  const charge = getUnCharge(principalAmount);
  const amountToSettle = principalAmount - charge;

  const classDetails = (await getClassDetailsByregno(pendingPaymentData.regno, pendingPaymentData.universityId)).details;
  const classRef = db.collection("schools").doc(classDetails.universityId)
    .collection("faculties").doc(classDetails.facultyId)
    .collection("departments").doc(classDetails.departmentId)
    .collection("classes").doc(classDetails.classId);

  logger.info("Payment validated and processing begins", {
    regno: pendingPaymentData.regno,
    cart: pendingPaymentData.cart
  });
// 🔢 Percent-based constants (easier to maintain)
const GATEWAY_PERCENTAGE = 0.41666;
const REVENUE_PERCENTAGE = 1 - GATEWAY_PERCENTAGE;

// 🔁 Prepare all reads (count + due documents) BEFORE transaction
const serialMap = new Map(); // Maps dueId => lastSerialNumber

for (const due of pendingPaymentData.cart) {
  const dueRef = classRef.collection("dues").doc(due.dueId);
  const dueSnapshot = await dueRef.get();

  const lastSerial = dueSnapshot.exists && dueSnapshot.data().dueData?.lastSerialNumber
    ? dueSnapshot.data().dueData.lastSerialNumber
    : 0;

  serialMap.set(due.dueId, lastSerial);
}

await db.runTransaction(async (transaction) => {
  const doc = await transaction.get(paymentRef);
  const companyDoc = await transaction.get(companyMetricsRef);

  if (doc.data().status === 'pending') {
    transaction.update(paymentRef, {
      status: value.status,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      gatewayResponse
    });
  }

  // 💰 Update class balance
  transaction.set(classRef, {
    balances: {
      mainBalance: admin.firestore.FieldValue.increment(amountToSettle)
    },
    lastTransaction: {
      amount: amountToSettle,
      date: admin.firestore.FieldValue.serverTimestamp(),
      type: "credit",
      TxId: pendingPaymentData.TxId
    }
  }, { merge: true });

  // 🔁 Record all due payments
  for (const due of pendingPaymentData.cart) {
    const dueRef = classRef.collection("dues").doc(due.dueId);
    const recordsRef = dueRef.collection("records");
    const recordRef = recordsRef.doc(pendingPaymentData.regno);

    const nextSerial = (serialMap.get(due.dueId) || 0) + 1;

    // Set record
    transaction.set(recordRef, {
      serialNumber: nextSerial,
      paid: true,
      amount: due.dueAmount,
      settledAmount: due.dueAmount - getUnCharge(due.dueAmount),
      dueBatch: due.dueBatch,
      regno: pendingPaymentData.regno,
      reciept: false,
      studentName: pendingPaymentData.studentName,
      paidOn: admin.firestore.FieldValue.serverTimestamp(),
      TxId: pendingPaymentData.TxId
    });
    // Update due metadata
    transaction.update(dueRef, {
      "dueData.totalPayments": admin.firestore.FieldValue.increment(1),
      "dueData.totalAmount": admin.firestore.FieldValue.increment(due.dueAmount),
      "dueData.lastPaymentDate": admin.firestore.FieldValue.serverTimestamp(),
      "dueData.lastSerialNumber": nextSerial, // 👈 atomic serial update
      "dueData.paymentHistory": admin.firestore.FieldValue.arrayUnion({
        amount: due.dueAmount,
        regno: pendingPaymentData.regno,
        date: Date.now(),
        TxId: pendingPaymentData.TxId
      })
    });
  }

  // 🧾 Log transaction in class + central record
  const transactionDetails = {
    amount: principalAmount,
    settledAmount: amountToSettle,
    regno: pendingPaymentData.regno,
    subjectName: pendingPaymentData.studentName,
    TxId: pendingPaymentData.TxId,
    charge: charge,
    type: 'due_payment',
    prePayment: { pendingPaymentData },
    status: 'completed',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  transaction.set(
    classRef.collection('transactions').doc(pendingPaymentData.TxId),
    transactionDetails
  );
  transaction.set(
    db.collection('transactions').doc(pendingPaymentData.TxId),{
      ...transactionDetails,
      universityId: classDetails.universityId,
      facultyId: classDetails.facultyId,
      departmentId: classDetails.departmentId,
      classId: classDetails.classId
    }
  );

  // 🏦 Update company metrics
  if (!companyDoc.exists) {
    transaction.set(companyMetricsRef, {
      transactions: {
        total: 1,
        volume: principalAmount,
        colleciveCharge: charge,
        gatewayRemit: (charge * GATEWAY_PERCENTAGE).toFixed(2),
        revenue: (charge * REVENUE_PERCENTAGE).toFixed(2),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        byUniversity: {
          [pendingPaymentData.universityId]: {
            total: 1,
            volume: principalAmount
          }
        }
      }
    });
  } else {
    transaction.update(companyMetricsRef, {
      "transactions.total": admin.firestore.FieldValue.increment(1),
      "transactions.volume": admin.firestore.FieldValue.increment(principalAmount),
      "transactions.revenue": admin.firestore.FieldValue.increment(charge * REVENUE_PERCENTAGE),
      "transactions.gatewayRemit": admin.firestore.FieldValue.increment(charge * GATEWAY_PERCENTAGE),
      "transactions.colleciveCharge": admin.firestore.FieldValue.increment(charge),
      "transactions.lastUpdated": admin.firestore.FieldValue.serverTimestamp(),
      [`transactions.byUniversity.${pendingPaymentData.universityId}.total`]: admin.firestore.FieldValue.increment(1),
      [`transactions.byUniversity.${pendingPaymentData.universityId}.volume`]: admin.firestore.FieldValue.increment(principalAmount)
    });
  }
});


  logger.info("Transaction processed successfully", {
    TxId: pendingPaymentData.TxId
  });

  return {
    code: 200,
    body: { success: true, message: "Notification Acknowledged!" }
  };
}


export async function checkPaymentStatus(request, reply) {
    try{
        const { admin, db } = await import ('./firebaseServices.js');
        const Joi = (await import('joi')).default;
        // 1. Validate the URL parameter
        const schema = Joi.string()
            .pattern(/^[A-Z0-9]{10,20}$/) // Adjust pattern as needed
            .required();

        const { error, value: accountNumber } = schema.validate(request.params.accountNumber);
        if (error) {
            return reply.code(400).send({
                success: false,
                message: "Invalid account number format"
            });
        }

        // 2. Fetch payment status
        
        const paymentRef = db.collection("pendingPayments").doc(accountNumber);
        const nubanRef = db.collection("meta").doc("nubans");
        const paymentDoc = await paymentRef.get();
        if (!paymentDoc.exists) {
        return reply.code(404).send({ 
            success: false, 
            message: "Payment attempt not found" 
        });
        }
        let pendingPaymentData = paymentDoc.data();

        if (pendingPaymentData.status === "success"){
            console.log("Payment has been marked successful!");
            await db.runTransaction(async (transaction) => {            
                transaction.update(nubanRef, {
                        available: admin.firestore.FieldValue.arrayUnion(pendingPaymentData.accountDetails)
                    });
                console.log("NUBAN made available");
                transaction.delete(paymentRef);
                console.log("Pending payment Document deleted");
            });
        }
        return reply.code(200).send({
            success: true,
            status: pendingPaymentData.status,
            amount: pendingPaymentData.amount,
        });
    }catch(error){
        console.log("Error finalizing Transaction:", error);
        return reply.code(500).send({
        success: false,
        message: "Error finalizing Transaction",
        error: process.env.NODE_ENV === 'development' ? error.message : error || undefined
        });
    }
}

/**This endpoint will be assigned to a cloud scheduller to be called every 10 minutes */
export async function cancelPayment(request, reply) {
    try {
        const { logger } = functions;
        const { admin, db } = await import ('./firebaseServices.js');
        const Joi = (await import('joi')).default;
        const schema = Joi.object({
            accountNumber: Joi.string().required()
        });

        const { error, value } = schema.validate(request.body);
        if (error) {
            return reply.code(400).send({ 
                success: false, 
                message: error.details[0].message 
            });
        }

        const { accountNumber } = value;
        const paymentRef = db.collection('pendingPayments').doc(accountNumber);
        const nubanRef = db.collection("meta").doc("nubans");

        await db.runTransaction(async (transaction) => {
            // 1. Get payment record
            const paymentDoc = await transaction.get(paymentRef);
            if (!paymentDoc.exists) {
                throw new Error("Payment record not found");
            }

            const paymentData = paymentDoc.data();

            // 2. Verify payment is still pending
            if (paymentData.status !== 'pending') {
                throw new Error(`Cannot cancel - payment already ${paymentData.status}`);
            }

            // 3. Make NUBAN available again
            transaction.update(nubanRef, {
                available: admin.firestore.FieldValue.arrayUnion(paymentData.accountDetails)
            });

            // 4. Log cancelled transaction
            const txRef = db.collection('cancelledTransactions').doc(paymentData.TxId);
            transaction.set(txRef, {
                ...paymentData,
                cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                status: 'cancelled'
            });

            // 5. Delete pending payment
            transaction.delete(paymentRef);
        });

        logger.info(`Payment cancelled for account: ${accountNumber}`);
        return reply.code(200).send({ 
            success: true,
            message: "Payment successfully cancelled"
        });

    } catch (error) {
        console.error("Payment cancellation failed:", error);
        return reply.code(500).send({
            success: false,
            message: error.message || "Payment cancellation failed",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

export async function checkPaymentTimeout(request, reply) {
    try {
        const count = await runTimeoutProcessor();
        return reply?.code?.(200).send({ 
            success: true, 
            timedOut: count 
        });
    } catch (error) {
        logger.error("Payment timeout processing failed", {
            error: error.message,
            stack: error.stack
        });

        return reply?.code?.(500).send({ 
            success: false, 
            message: "Timeout processing failed" 
        });
    }
}


export async function runTimeoutProcessor() {
    const { logger } = functions;
    const { admin, db } = await import ('./firebaseServices.js');

    const now = Date.now();
    const paymentTimeoutThreshold = now - 900000; // 15 minutes

    const nubanRef = db.collection("meta").doc("nubans");
    const metricsRef = db.collection("metrics").doc("payments");

    const pendingPayments = await db.collection('pendingPayments')
        .where("status", "==", "pending")
        .where("createdAt", "<", new Date(paymentTimeoutThreshold))
        .get();

    const batchTimeout = db.batch();
    const batchFailed = db.batch();

    pendingPayments.forEach(doc => {
        const paymentData = doc.data();
        const paymentRef = doc.ref;
        const failedRef = db.collection("failedPayments").doc(paymentData.accountDetails.accountNumber);
        
        batchTimeout.update(nubanRef, {
            available: admin.firestore.FieldValue.arrayUnion(paymentData.accountDetails)
        });

        batchFailed.set(failedRef, {
            ...paymentData,
            status: "timeout",
            resolvedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        batchTimeout.delete(paymentRef);
    });

    batchTimeout.update(metricsRef, {
        timedOutPayments: admin.firestore.FieldValue.increment(pendingPayments.size),
        lastTimeoutRun: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await Promise.all([batchTimeout.commit(), batchFailed.commit()]);

    logger.info(`Timed out ${pendingPayments.size} payments`, {
        success: true,
        count: pendingPayments.size
    });

    return pendingPayments.size;
}


async function checkIfOrphaned(NUBAN, amount) {
    try {
        const { admin, db } = await import ('./firebaseServices.js');
        const now = Date.now();
        const orphanWindow = 24 * 60 * 60 * 1000; // 24 hours
        const failedThreshold = now - orphanWindow;

        // Check in failedPayments first
        const failedDoc = await db.collection("failedPayments").doc(NUBAN).get();
        
        if (failedDoc.exists) {
            const paymentData = failedDoc.data();
            const isOrphaned = (
                paymentData.status === "timeout" &&
                paymentData.amount === amount &&
                paymentData.createdAt.toDate().getTime() > failedThreshold
            );
            
            return { 
                orphaned: isOrphaned, 
                doc: isOrphaned ? paymentData : null 
            };
        }

        // Check in pendingPayments as fallback
        const pendingDoc = await db.collection("pendingPayments").doc(NUBAN).get();
        if (pendingDoc.exists) {
            const paymentData = pendingDoc.data();
            const isOrphaned = (
                paymentData.status === "pending" &&
                paymentData.amount === amount &&
                paymentData.createdAt.toDate().getTime() > failedThreshold
            );
            
            return { 
                orphaned: isOrphaned, 
                doc: isOrphaned ? paymentData : null 
            };
        }

        return { orphaned: false, doc: null };

    } catch (error) {
        logger.error("Orphaned payment check failed", {
            NUBAN,
            amount,
            error: error.message
        });
        
        // Fail safe - assume not orphaned
        return { orphaned: false, doc: null };
    }
}

export async function generateNUBANS() {     
    const { logger } = functions;
    const { admin, db } = await import ('./firebaseServices.js');

    const BATCH_SIZE = 5;
    const BASE_EMAIL = "bine00";
    const BASE_PHONE = "0901234";

  const operationId = `nuban-gen-${Date.now()}`;
  logger.info(`NUBAN generation started`, { operationId });

  try {
    // 1. Get current index
    const indexRef = db.collection("meta").doc("nubans");
    const indexSnapshot = await indexRef.get();
    const currentCount = indexSnapshot.data()?.all?.length || 0;
    const availableCount = indexSnapshot.data()?.available?.length || 0;
    logger.info("lengths:",{
        currentCount: currentCount, 
        availableCount: availableCount
    });

    // 2. Generate batch of NUBANs
    const newNubans = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const seq = currentCount + i;
      const suffix = String(seq).padStart(4, '0'); // e.g. "0005", "0123"
      const nuban = await generateSingleNUBAN({
        email: `${BASE_EMAIL}${seq}@gmail.com`,
        phone: `${BASE_PHONE}${suffix}`,
        reference: `acc00${seq}`,
        operationId
      });

      if (nuban && nuban.accountNumber) {
        newNubans.push(nuban);
        logger.info(`Generated NUBAN ${i+1}/${BATCH_SIZE}`, {
            result: nuban,
            accountNumber: nuban.accountNumber,
            operationId
        });
        } else {
        logger.warn(`Skipped invalid NUBAN at index ${i}`, {
            result: nuban,
            operationId
        });
        }
    }

    // 3. Atomic update
    if (newNubans.length > 0) {
        logger.info("Final NUBANs to be saved", {
            operationId,
            nubanCount: newNubans.length,
            nubans: newNubans
        });

      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(indexRef);
        const existing = doc.data()?.all || [];
        const existingAvailable = doc.data()?.available || [];

        let toAvailable = [];

        if (existingAvailable.length === 0) {
            toAvailable = [...existing, ...newNubans];
        }

        const updates = {
            all: [...existing, ...newNubans],
            lastGenerated: admin.firestore.FieldValue.serverTimestamp()
        };

        if (toAvailable.length > 0) {
            updates.available = admin.firestore.FieldValue.arrayUnion(...toAvailable);
        }

        transaction.update(indexRef, updates);
      });


      logger.success(`Generated ${newNubans.length} new NUBANs`, {
        operationId,
        sampleAccount: newNubans[0]?.accountNumber
      });
    }

    return newNubans;

  } catch (error) {
    logger.error("NUBAN generation failed", {
      operationId,
      error: error.message,
      stack: error.stack
    });
    throw error; // For Cloud Function retry
  }
}

async function generateSingleNUBAN({ email, phone, reference, operationId }) {
  try {
  const { logger } = functions;
  const billstackSecret = process.env.BILLSTACK_SECRET;

  // Set up timeout with AbortController
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10 seconds
  const reqBody = {
      email,
      reference,
      firstName: "CHECKOUT",
      lastName: "",
      phone,
      bank: "PALMPAY"
    };

  const response = await fetch("https://api.billstack.co/v2/thirdparty/generateVirtualAccount/", {
    method: "POST",
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${billstackSecret}`
    },
    body: JSON.stringify(reqBody),
    signal: controller.signal
  });

  clearTimeout(timeout); // Clear the timeout when response is received
  logger.info("Request made with payload:", reqBody);
  if (!response.ok) {
    logger.warn("Billstack HTTP error", {
        status: response.status,
        statusText: response.statusText,
        operationId
    });
    }

    const data = await response.json();
logger.info("Response gotten with body:", data);
    if (!data?.status || !data.data?.account) {
    logger.warn("Invalid API response", {
        responseData: data,
        statusCode: response.status,
        operationId
    });
    return null;
    }


  return {
    accountNumber: data.data.account[0].account_number,
    accountName: "CHECKOUT",
    bankName: data.data.account[0].bank_name,
    available: true,
    meta: {
      generatedAt: new Date().toISOString(),
      reference: data.data.reference
    }
  };

} catch (error) {
  const { logger } = functions;
  logger.warn("Single NUBAN generation failed", {
    reference,
    operationId,
    error: error.message,
    isAbort: error.name === "AbortError"
  });
  return null;
}
}