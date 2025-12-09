const functions = await import('firebase-functions');
import { adminProcessWithdrawal } from './telegramBot/bot.js';
import { getClassDetailsByUID, newTransaction } from './utils.js';

export async function setWithdrawalAccount(request, reply) {
    const { admin,auth, db } = await import ('./firebaseServices.js');
    const { logger } = functions;
    const token = request.headers.authorization?.split("Bearer ")[1];
    if (!token) return reply.code(401).send({ error: "Unauthorized" });
    try{
        const decodedToken = await auth.verifyIdToken(token);
        const uid = decodedToken.uid;
        if (!uid) {
            return reply.code(401).send({ error: "Invalid authentication!" });
        }
        const details = await getClassDetailsByUID(uid);
        const classRef = db.collection("schools").doc(details.universityId)
                        .collection("faculties").doc(details.facultyId)
                        .collection("departments").doc(details.departmentId)
                        .collection("classes").doc(details.classId);
        await classRef.set({
            "disbursment": request.body
        }, {merge: true}); 
        logger.info("Withdrawal account set successfully!", {uid, ...request.body});
        return reply.code(200).send({
            success: true,
            message: "Withdrawal account set successfully"
        });
    }catch(err){
        logger.warn("Issue setting Withdrawal account", err);
        return reply.code(200).send({
            success: false,
            message: `Issue setting Withdrawal account: ${err}`
        });
    }
}

export async function makeWithdrawal(request, reply) {
    const { admin, auth, db } = await import('./firebaseServices.js');
    const { logger } = functions;
    const token = request.headers.authorization?.split('Bearer ')[1];
    const charge = 30;
    
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });

    try {
        // 1. Authenticate user
        const decodedToken = await auth.verifyIdToken(token);
        const uid = decodedToken.uid;
        if (!uid) {
            return reply.code(401).send({ error: 'Invalid authentication!' });
        }

        // 2. Validate withdrawal amount
        const { amount } = request.body;
        if (!amount || isNaN(amount) || amount <= 0) {
            if (amount < 500){
                return reply.code(200).send({ 
                success: false,
                message: 'Amount must not be less than ₦500.00'
            });
            }
            return reply.code(200).send({ 
                success: false,
                message: 'Invalid withdrawal amount'
            });
        }

        // 3. Get class details and disbursement account info
        const details = await getClassDetailsByUID(uid);
        const classRef = db.collection('schools').doc(details.universityId)
                        .collection('faculties').doc(details.facultyId)
                        .collection('departments').doc(details.departmentId)
                        .collection('classes').doc(details.classId);

        const classDoc = await classRef.get();
        if (!classDoc.exists) {
            return reply.code(404).send({ error: 'Class not found' });
        }

        const classData = classDoc.data();
        const disbursementDetails = classData.disbursment;
        const currentBalance = classData.balances?.mainBalance || 0;

        // 4. Check sufficient balance
        if (currentBalance < (amount + charge)) {
            return reply.code(200).send({ 
                success: false,
                message: 'Insufficient balance' 
            });
        }

        // 5. Generate transaction ID and create withdrawal record
        const TxId = newTransaction(uid);
        const total = amount + charge;
        const withdrawalData = {
            amount,
            charge,
            balanceBefore: currentBalance,
            balanceAfter: currentBalance - total,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            initiatedBy: uid,
            disbursementDetails,
            TxId,
            classDetails: {
                universityId: details.universityId,
                facultyId: details.facultyId,
                departmentId: details.departmentId,
                classId: details.classId
            }
        };

        // 6. Run transaction to update balance and create withdrawal record
        await db.runTransaction(async (transaction) => {
            // Update class balance
            transaction.update(classRef, {
                'balances.mainBalance': admin.firestore.FieldValue.increment(-total)
            });

            // Create withdrawal record
            const withdrawalRef = db.collection('withdrawals').doc(TxId);
            transaction.set(withdrawalRef, withdrawalData);

            // Add to class transactions
            const classTransactionRef = classRef.collection('transactions').doc(TxId);
            transaction.set(classTransactionRef, {
                ...withdrawalData,
                type: 'withdrawal',
                status: 'pending'
            });
        });

        await adminProcessWithdrawal({
        TxId,
        amount,
        accountDetails: disbursementDetails,
        classInfo: `${details.universityId} > ${details.facultyId} > ${details.departmentId}`,
        initiatedBy: uid
        });

        return reply.code(200).send({
            success: true,
            message: 'Withdrawal request submitted successfully',
            TxId
        });

    } catch (err) {
        logger.error('Withdrawal processing failed:', err);
        return reply.code(500).send({
            success: false,
            message: 'Withdrawal processing failed',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}
