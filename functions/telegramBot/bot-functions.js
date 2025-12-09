import * as logger from "firebase-functions/logger";
import { admin, auth, db } from "../firebaseServices.js";
import { getClassDetailsByUID } from "../utils.js";


export async function verifyAdmin(approve, id, role) {
    try{
        logger.info("Parameters:", {approve, id, role});
        if(approve){
            await db.collection(role == "cr" ? "course-reps" : "reps").doc(id).update({ "personal.profileVerified": true });

            logger.info(`Admin profile: ${id} Successfully approved`);
            return true;
        }else{
            const classDetails = await getClassDetailsByUID(id);
            await db.collection("schools").doc(classDetails.universityId)
                                .collection("faculties").doc(classDetails.facultyId)
                                .collection("departments").doc(classDetails.departmentId)
                                .collection("classes").doc(classDetails.classId).delete();
            await db.collection("schools")
                      .doc(classDetails.universityId)
                      .collection("studentProfiles")
                      .doc(classDetails.cpregno).delete();
            await db.collection(role == "cr" ? "course-reps" : "reps").doc(id).delete();
            await auth.deleteUser(id);
            logger.info(`Successfully deleted user and records with UID: ${id}`);
            return true;
        }
    }catch(err){
        logger.error(`Error resolving verification of admin account ${id}:`, err);
        if (err.code === 'auth/user-not-found') {
            logger.warn(`User ${uid} not found.`);
        }
        return false;
    }
}

export async function processWithdrawalStatus(TxId, status) {
  const { admin, db } = await import('../firebaseServices.js');
  
  try {
    const withdrawalRef = db.collection('withdrawals').doc(TxId);
    const updateData = {
      status,
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (status === 'rejected') {
      // If rejected, refund the amount
      const withdrawalDoc = await withdrawalRef.get();
      if (withdrawalDoc.exists) {
        const { amount, classDetails } = withdrawalDoc.data();
        const classRef = db.collection('schools').doc(classDetails.universityId)
                        .collection('faculties').doc(classDetails.facultyId)
                        .collection('departments').doc(classDetails.departmentId)
                        .collection('classes').doc(classDetails.classId);
        
        await db.runTransaction(async (transaction) => {
          transaction.update(classRef, {
            'balances.mainBalance': admin.firestore.FieldValue.increment(amount)
          });
          transaction.update(withdrawalRef, updateData);
        });
      }
    } else {
      await withdrawalRef.update(updateData);
    }

    // Update transaction status in class records
    const withdrawalDoc = await withdrawalRef.get();
    if (withdrawalDoc.exists) {
      const { classDetails } = withdrawalDoc.data();
      const classRef = db.collection('schools').doc(classDetails.universityId)
                      .collection('faculties').doc(classDetails.facultyId)
                      .collection('departments').doc(classDetails.departmentId)
                      .collection('classes').doc(classDetails.classId);
      
      await classRef.collection('transactions').doc(TxId).update({
        status
      });
    }

    logger.info(`Withdrawal ${TxId} processed as ${status}`);
    return true;
  } catch (error) {
    logger.error(`Error processing withdrawal ${TxId}:`, error);
    throw error;
  }
}