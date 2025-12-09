//import PDFDocument from 'pdfkit';
//import { PassThrough } from 'stream'; // Native Node.js module
//import PDFTable from 'pdfkit-table';


export async function createDue(request, reply) {
    try{
        const { auth, db, admin } = await import('./firebaseServices.js');
        const { getCharge, getClassDetailsByUID } = await import('./utils.js');
        const Joi = (await import('joi')).default;

        const token = request.headers.authorization?.split("Bearer ")[1];
        if (!token) return reply.code(401).send({ error: "Unauthorized" });
        const decodedToken = await auth.verifyIdToken(token);
        const classDetails = await getClassDetailsByUID(decodedToken.uid);

        const classRef = db.collection("schools").doc(classDetails.universityId)
                            .collection("faculties").doc(classDetails.facultyId)
                            .collection("departments").doc(classDetails.departmentId)
                            .collection("classes").doc(classDetails.classId);
        const {name, id, type, amount } = request.body;
        if(!name || !id || !type || !amount){
            return reply.code(400).send({ 
            success: false,
            error: "Missing required parameters" ,
            body: request.body
            });
        }
        // Suggested improvements:
        const schema = Joi.object({
            name: Joi.string().min(3).max(100).required(),
            id: Joi.string()
                   //.regex(/^[a-zA-Z0-9_\-]+$/)
                   .min(3)
                   .max(50)
                   .required(),
            type: Joi.string().valid('textbook', 'registration', 'event', 'other').required(),
            amount: Joi.number().positive().precision(2).required(),
            charge: Joi.number().positive().required(),
            description: Joi.string().max(1000).allow(''),
            dueBatch: Joi.string().max(50).allow(''),
            isCompulsory: Joi.boolean().default(false),
            isOneTime: Joi.boolean().default(true),
            passCharge: Joi.boolean().default(false),
            status: Joi.string().valid('active', 'inactive', 'pending').default('active')
        });

        const { error, value } = schema.validate(request.body);
        if (error) {
            return reply.code(400).send({
                success: false,
                error: error.details[0].message,
                details: error.details
            });
        }
        const dueRef = classRef.collection("dues").doc(id);
        const dueSnapshot = await dueRef.get();
        if (dueSnapshot.exists) {
            return reply.code(409).send({  // 409 Conflict is more appropriate
                success: false,
                error: `Due ${id} already exists!`
            });
        }
        try {
            await db.runTransaction(async (transaction) => {
                const dueSnapshot = await transaction.get(dueRef);
                if (dueSnapshot.exists) {
                    throw new Error(`Due ${id} already exists!`);
                }
                
                transaction.set(dueRef, {
                    dueDetails: {
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        ...value, // Use validated value
                        createdBy: decodedToken.uid // Track creator
                    },
                    dueData: {
                        totalPayments: 0,        // Number of payments
                        totalAmount: 0,         // Sum of all payments
                        lastPaymentDate: null,  // Date of last payment
                        lastPaymentAmount: 0,    // Amount of last payment
                        paymentHistory: []      // Optional: array of payment references
                    }
                });
            });
            return reply.code(201).send({
                success: true,
                data: {
                    dueId: id,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                },
                message: `Due ${id} created successfully`
            });
        } catch (error) {
            console.error("Error performing atomic transaction:", error);
            return reply.code(500).send({
            success: false,
            message: error.message || "Internal server error",
            });
        }
        //When a payment for this due has been made, the mapped regno for the payment will be saved to 'dueRef.collection("records").doc(regno).set({paidOn: date});'
        //Details of this due shoyld be easily retrieved with 'dueRef.get().data().dueDetails'
    }catch (error) {
        console.error("Error creating due:", error);
        return reply.code(500).send({
          success: false,
          message: error.message || "Internal server error",
        });
      }
}

export async function fetchDues(request, reply) {
    try {
        const { auth, db, admin } = await import('./firebaseServices.js');
        const { getCharge, getClassDetailsByUID } = await import('./utils.js');
        const Joi = (await import('joi')).default;

        const token = request.headers.authorization?.split("Bearer ")[1];
        if (!token) return reply.code(401).send({ error: "Unauthorized" });
        const decodedToken = await auth.verifyIdToken(token);
        const classDetails = await getClassDetailsByUID(decodedToken.uid);

        const duesRef = db.collection("schools").doc(classDetails.universityId)
                        .collection("faculties").doc(classDetails.facultyId)
                        .collection("departments").doc(classDetails.departmentId)
                        .collection("classes").doc(classDetails.classId)
                        .collection("dues");

        let query = duesRef.orderBy("dueDetails.createdAt", "desc");
        
        const snapshot = await query.get();
        
        const dues = [];
        snapshot.forEach(doc => {
            dues.push({
                id: doc.id,
                ...doc.data().dueDetails,
                stats: doc.data().dueData
            });
        });

        // Get total count for pagination
        const totalSnapshot = await query.count().get();
        const total = totalSnapshot.data().count;

        return reply.code(200).send({
            success: true,
            data: dues,
            page: 1,
            pages: 2,
            total
        });

    } catch (error) {
        console.error("Error fetching dues:", error);
        return reply.code(500).send({
            success: false,
            message: "Failed to fetch dues"
        });
    }
}

export async function editDue(request, reply) {     
    try {
        const { auth, db, admin } = await import('./firebaseServices.js');
        const { getCharge, getClassDetailsByUID } = await import('./utils.js');
        const Joi = (await import('joi')).default;

        const token = request.headers.authorization?.split("Bearer ")[1];
        if (!token) return reply.code(401).send({ error: "Unauthorized" });
        
        const decodedToken = await auth.verifyIdToken(token);
        const classDetails = await getClassDetailsByUID(decodedToken.uid);
        const { dueId, updates } = request.body;

        // Validation schema for updates
        const schema = Joi.object({
            name: Joi.string().min(3).max(100),
            id: Joi.string().regex(/^[a-zA-Z0-9_\-]+$/).min(3).max(20),
            type: Joi.string().valid('textbook', 'registration', 'event', 'other'),
            amount: Joi.number().positive().precision(2),
            charge: Joi.number().positive(),
            description: Joi.string().max(1000).allow(''),
            dueBatch: Joi.string().max(50).allow(''),
            isCompulsory: Joi.boolean(),
            isOneTime: Joi.boolean(),
            passCharge: Joi.boolean(),
            status: Joi.string().valid('active', 'inactive', 'pending')
        }).min(1);

        const { error, value } = schema.validate(updates);
        if (error) {
            return reply.code(400).send({
                success: false,
                error: error.details[0].message
            });
        }
        value.charge = getCharge(value.amount);

        const dueRef = db.collection("schools").doc(classDetails.universityId)
                        .collection("faculties").doc(classDetails.facultyId)
                        .collection("departments").doc(classDetails.departmentId)
                        .collection("classes").doc(classDetails.classId)
                        .collection("dues").doc(dueId);

        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(dueRef);
            if (!doc.exists) {
                throw new Error('Due not found');
            }
            
            const updateObject = {
                'dueData.lastUpdated': admin.firestore.FieldValue.serverTimestamp()
            };
            
            // Build dueDetails updates
            for (const [key, val] of Object.entries(value)) {
                updateObject[`dueDetails.${key}`] = val;
            }
            
            // Add metadata fields
            updateObject['dueDetails.updatedAt'] = admin.firestore.FieldValue.serverTimestamp();
            updateObject['dueDetails.updatedBy'] = decodedToken.uid;

            transaction.update(dueRef, updateObject);
        });

        return reply.code(200).send({
            success: true,
            data: {
                dueId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            message: "Due updated successfully"
        });

    } catch (error) {
        console.error("Error updating due:", error);
        return reply.code(error.message === 'Due not found' ? 404 : 500).send({
            success: false,
            message: error.message || "Failed to update due"
        });
    }
}

export async function deleteDue(request, reply) {
    try {
        const { auth, db, admin } = await import('./firebaseServices.js');
        const { getCharge, getClassDetailsByUID } = await import('./utils.js');
        const Joi = (await import('joi')).default;
        
        // Authentication
        const token = request.headers.authorization?.split("Bearer ")[1];
        if (!token) return reply.code(401).send({ error: "Unauthorized" });
        const decodedToken = await auth.verifyIdToken(token);
        
        // Get class details
        const classDetails = await getClassDetailsByUID(decodedToken.uid);
        if (!classDetails) {
            return reply.code(403).send({ error: "Forbidden - User not associated with any class" });
        }

        // Validate input
        const { dueId } = request.body;
        if (!dueId) {
            return reply.code(400).send({ error: "Due code is required" });
        }

        // Get references
        const dueRef = db.collection("schools").doc(classDetails.universityId)
                        .collection("faculties").doc(classDetails.facultyId)
                        .collection("departments").doc(classDetails.departmentId)
                        .collection("classes").doc(classDetails.classId)
                        .collection("dues").doc(dueId);   

        // Check if due exists
        const dueDoc = await dueRef.get();
        if (!dueDoc.exists) {
            return reply.code(404).send({
                success: false,
                message: "Due not found"
            });
        }

        // Check for existing payments
        const paymentsRef = dueRef.collection('records');
        const paymentsSnapshot = await paymentsRef.limit(1).get();
        
        if (!paymentsSnapshot.empty) {
            return reply.code(400).send({
                success: false,
                message: "Cannot delete due with existing payments. Please deactivate it instead."
            });
        }

        // Perform deletion in transaction
        await db.runTransaction(async (transaction) => {
            transaction.delete(dueRef);
            
            // If you have any related data that needs to be cleaned up, add those deletions here
            // Example: transaction.delete(relatedRef);
        });

        return reply.code(200).send({
            success: true,
            data: {
                dueId,
                deletedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            message: "Due deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting due:", error);
        return reply.code(500).send({
            success: false,
            message: "An unexpected error occurred while deleting the due"
        });
    }
}

export async function dueRecords(request, reply) {
  try {
    const { auth, db, admin } = await import('./firebaseServices.js');
    const { getCharge, getClassDetailsByUID } = await import('./utils.js');
    const Joi = (await import('joi')).default;

    // 1. Authentication
    const token = request.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return reply.code(401).send({ success: false, error: "Unauthorized" });
    }

    const decodedToken = await auth.verifyIdToken(token);

    // 2. Get class details
    const classDetails = await getClassDetailsByUID(decodedToken.uid);
    if (!classDetails) {
      return reply.code(403).send({ success: false, error: "UID not associated with any class" });
    }

    // 3. Validate input
    const { dueId } = request.body;
    if (!dueId) {
      return reply.code(400).send({ success: false, error: "Due code is required" });
    }

    // 4. Build records collection ref
    const dueRecordsRef = db.collection("schools").doc(classDetails.universityId)
      .collection("faculties").doc(classDetails.facultyId)
      .collection("departments").doc(classDetails.departmentId)
      .collection("classes").doc(classDetails.classId)
      .collection("dues").doc(dueId)
      .collection("records");

    // 5. Fetch records
    const snapshot = await dueRecordsRef.get();

    if (snapshot.empty) {
      return reply.code(200).send({
        success: true,
        message: "No records found for this due",
        records: []
      });
    }

    const records = [];
    snapshot.forEach(doc => {
      records.push({ id: doc.id, ...doc.data() });
    });

    return reply.code(200).send({
      success: true,
      message: "Records fetched successfully",
      records
    });

  } catch (error) {
    console.error("Error fetching due records:", error);
    return reply.code(500).send({
      success: false,
      message: "An unexpected error occurred while fetching due records"
    });
  }
}

export async function confirmDueReciept(request, reply) {
    try{
        const { auth, db, admin } = await import('./firebaseServices.js');
        const { getCharge, getClassDetailsByUID } = await import('./utils.js');
        const Joi = (await import('joi')).default;
        
        // 1. Authentication
    const token = request.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return reply.code(401).send({ success: false, error: "Unauthorized" });
    }

    const decodedToken = await auth.verifyIdToken(token);

    // 2. Get class details
    const classDetails = await getClassDetailsByUID(decodedToken.uid);
    if (!classDetails) {
      return reply.code(403).send({ success: false, error: "UID not associated with any class" });
    }

    // 3. Validate input
    const { dueId, regno } = request.body;
    if (!dueId) {
      console.log("Missing parameters");
      console.log(request.body);
      return reply.code(400).send({ success: false, error: "Due code is required" });
    }

    // 4. Build records collection ref
    const dueRecordsRef = db.collection("schools").doc(classDetails.universityId)
      .collection("faculties").doc(classDetails.facultyId)
      .collection("departments").doc(classDetails.departmentId)
      .collection("classes").doc(classDetails.classId)
      .collection("dues").doc(dueId)
      .collection("records").doc(regno);

    await dueRecordsRef.update({
        reciept: true,
    });
    return reply.code(200).send({
      success: true,
      message: "Records updated successfully"
    });
    }catch(error){

    }
}