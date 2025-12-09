import * as logger from "firebase-functions/logger";

export async function getProfile(request, reply) {
  try {
    const { admin, db } = await import('./firebaseServices.js');
    const { universityId, regno } = request.body;

    if (!universityId || !regno) {
      return reply.code(400).send({ error: "Missing required fields" });
    }

    const now = Date.now();
    const paymentTimeoutThreshold = now - 15 * 60 * 1000; // 15 minutes

    const pendingPaymentsSnap = await db.collection('pendingPayments')
      .where("status", "==", "pending")
      .where("createdAt", "<", new Date(paymentTimeoutThreshold))
      .where("regno", "==", regno)
      .get();

    const paymentDetails = [];
    pendingPaymentsSnap.forEach(doc => {
      paymentDetails.push({ id: doc.id, ...doc.data() });
    });

    const { getClassDetailsByregno } = await import("./utils.js");
    const details = await getClassDetailsByregno(regno, universityId);

    if (details.success) {
      return reply.code(200).send({
        details,
        pendingPayment: paymentDetails.length > 0 ? paymentDetails[0] : null
      });
    } else {
      return reply.code(404).send({
        error: "Class details not found",
        details
      });
    }
  } catch (err) {
    console.error("getProfile error:", err);
    return reply.code(500).send({
      error: "Failed to fetch profile",
      message: err.message
    });
  }
}


export async function getClassDues(request, reply) {
    try {        
        //const { logger } = await import('./firebase-functions');
        const { admin, db } = await import ('./firebaseServices.js');
        const Joi = (await import('joi')).default; // ✅ CORRECT
        // Input Validation
        const schema = Joi.object({
            universityId: Joi.string().required(),
            facultyId: Joi.string().required(),
            departmentId: Joi.string().required(),
            classId: Joi.string().required(),
            regno: Joi.string().required(),
        });

        const { error } = schema.validate(request.body);
        if (error) {
            logger.warn('Error validating inputs', {error});
            return reply.code(400).send({ success: false, message: error.details[0].message });
        }

        const { universityId, facultyId, departmentId, classId, regno } = request.body;

        const duesRef = db.collection("schools").doc(universityId)
            .collection("faculties").doc(facultyId)
            .collection("departments").doc(departmentId)
            .collection("classes").doc(classId.toLowerCase())
            .collection("dues");

        const duesSnapshot = await duesRef.orderBy("dueDetails.createdAt", "desc").get();

        console.log("Queried path:", `schools/${universityId}/faculties/${facultyId}/departments/${departmentId}/classes/${classId}/dues`);
        console.log("Dues found:", duesSnapshot.size);

        const paymentChecks = [];
        duesSnapshot.forEach(doc => {
            paymentChecks.push(
                duesRef.doc(doc.id).collection("records").doc(regno).get()
            );
        });

        const paymentSnapshots = await Promise.all(paymentChecks);

        const dues = duesSnapshot.docs.map((doc, index) => {
            const fullData = doc.data();
            const dueDetails = fullData.dueDetails || {};
            const paid = paymentSnapshots[index].exists;
            const paymentDetails = paid ? paymentSnapshots[index].data() : {};
            console.log("Due ID:", doc.id);
            console.log("Due Details:", dueDetails);
            console.log("Payment exists:", paid);

            return {
                id: doc.id,
                name: dueDetails.name,
                type: dueDetails.type,
                amount: dueDetails.amount,
                total: dueDetails.passCharge ? dueDetails.charge + dueDetails.amount : dueDetails.amount,
                charge: dueDetails.passCharge ? dueDetails.charge : 0,
                description: dueDetails.description,
                dueBatch: dueDetails.dueBatch,
                isCompulsory: dueDetails.isCompulsory || false,
                isOneTime: dueDetails.isOneTime || false,
                status: dueDetails.status || 'active',
                paid,
                paymentDetails,
                createdAt: dueDetails.createdAt?.toDate()?.toISOString()
            };
        });

        return reply.code(200).send({
            success: true,
            data: dues,
            count: dues.length
        });

    } catch (error) {
        console.error("Error fetching class dues:", error);
        return reply.code(500).send({
            success: false,
            message: "Failed to fetch class dues",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

export async function getClassLists(request, reply) {
    try {        
        const { admin, db } = await import ('./firebaseServices.js');
        const Joi = (await import('joi')).default; // ✅ CORRECT
        // Input Validation
        const schema = Joi.object({
            universityId: Joi.string().required(),
            facultyId: Joi.string().required(),
            departmentId: Joi.string().required(),
            classId: Joi.string().required(),
            regno: Joi.string().required(),
        });

        const {value, error } = schema.validate(request.body);
        if (error) {
            logger.warn('Error validating inputs', {error});
            return reply.code(400).send({ success: false, message: error.details[0].message });
        }

        const { universityId, facultyId, departmentId, classId} = request.body;

        const listsRef = db.collection("schools").doc(universityId)
            .collection("faculties").doc(facultyId)
            .collection("departments").doc(departmentId)
            .collection("classes").doc(classId.toLowerCase())
            .collection("lists");
        
        const listsSnapshot = await listsRef.orderBy("listDetails.createdAt", "desc").get();

        console.log("Queried path:", `schools/${universityId}/faculties/${facultyId}/departments/${departmentId}/classes/${classId}/lists`);
        console.log("Lists found:", listsSnapshot.size);

        const presenceChecks = [];
        listsSnapshot.forEach(doc => {
            presenceChecks.push(
                listsRef.doc(doc.id).collection("records").doc(value.regno).get()
            );
        });

        const presenceSnapshots = await Promise.all(presenceChecks);

        const lists = listsSnapshot.docs.map((doc, index) => {
            const fullData = doc.data();
            const listDetails = fullData.listDetails || {};
            const present = presenceSnapshots[index].exists;

            console.log("List ID:", doc.id);
            console.log("List Details:", listDetails);

            return {
                id: doc.id,
                name: listDetails.name,
                description: listDetails.description,
                listBatch: listDetails.listBatch,
                isCompulsory: listDetails.isCompulsory || false,
                status: listDetails.status || 'active',
                present,
                createdAt: listDetails.createdAt?.toDate()?.toISOString()
            };
        });

        return reply.code(200).send({
            success: true,
            data: lists,
            count: lists.length
        });

    } catch (error) {
        console.error("Error fetching class lists:", error);
        return reply.code(500).send({
            success: false,
            message: "Failed to fetch class lists",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

export async function joinList(request, reply) {
    try{
        //const { logger } = await import('./firebase-functions');
        const { admin, db } = await import ('./firebaseServices.js');
        const { getClassDetailsByregno } = await import("./utils.js");
        const Joi = (await import('joi')).default; // ✅ CORRECT

        const schema = Joi.object({
            listId: Joi.string().required(), // Minimum amount validation
            regno: Joi.string().pattern(/^[A-Z0-9]+$/).required(),
            universityId: Joi.string().required()
        });

        const { error, value } = schema.validate(request.body);
        if (error) {
            return reply.code(400).send({ 
                success: false, 
                message: error.details[0].message 
            });
        }
        logger.info("request.body sanitated", { value });
        const studentDetailSnapshot = await db.collection("schools").doc(value.universityId)
                                .collection("studentProfiles").doc(value.regno).get();
        const studentDetails = await studentDetailSnapshot.data();
        const classDetails = (await getClassDetailsByregno(value.regno, value.universityId)).details;
        const classRef = db.collection("schools").doc(classDetails.universityId)
                            .collection("faculties").doc(classDetails.facultyId)
                            .collection("departments").doc(classDetails.departmentId)
                            .collection("classes").doc(classDetails.classId);
        const listRecordRef = classRef.collection("lists").doc(value.listId)
                                     .collection("records").doc(value.regno);
        await db.runTransaction(async (transaction) => {
            transaction.set(listRecordRef, {
                name: studentDetails.name, 
                email: studentDetails.email, 
                phone: studentDetails.phone, 
                regno: studentDetails.regno,
                createdAt : admin.firestore.FieldValue.serverTimestamp()
            });
        });

        logger.info(`Student successfully added to list`, {studentDetails, value});
        return reply.code(200).send({
            success: true,
            message: `You've successfully joined the List!`
        });
    }catch(err){
        logger.error("Error joining list:", {error});
        return reply.code(500).send({
            success: false,
            message: "Failed to add student to list",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });   
    }
}