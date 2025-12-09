//import PDFDocument from 'pdfkit';
//import { PassThrough } from 'stream'; // Native Node.js module
//import PDFTable from 'pdfkit-table';

export async function createlist(request, reply) {
  try {
    const { auth, db, admin } = await import('./firebaseServices.js');
    const { getClassDetailsByUID } = await import('./utils.js');
    const Joi = (await import('joi')).default;

    const token = request.headers.authorization?.split("Bearer ")[1];
    if (!token) return reply.code(401).send({ error: "Unauthorized" });
    const decodedToken = await auth.verifyIdToken(token);
    const classDetails = await getClassDetailsByUID(decodedToken.uid);

    const classRef = db.collection("schools").doc(classDetails.universityId)
                        .collection("faculties").doc(classDetails.facultyId)
                        .collection("departments").doc(classDetails.departmentId)
                        .collection("classes").doc(classDetails.classId);
    
    const { name, id } = request.body;
    if (!name || !id) {
      return reply.code(400).send({ 
        success: false,
        error: "Missing required parameters",
        body: request.body
      });
    }

    const schema = Joi.object({
      name: Joi.string().min(3).max(100).required(),
      id: Joi.string().min(3).max(50).required(),
      description: Joi.string().max(1000).allow(''),
      listBatch: Joi.string().max(50).allow(''),
      isCompulsory: Joi.boolean().default(false),
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

    const listRef = classRef.collection("lists").doc(id.trim());
    const listSnapshot = await listRef.get();
    if (listSnapshot.exists) {
      return reply.code(409).send({
        success: false,
        error: `List ${id} already exists!`
      });
    }

    await db.runTransaction(async (transaction) => {
      const listSnapshot = await transaction.get(listRef);
      if (listSnapshot.exists) {
        throw new Error(`List ${id} already exists!`);
      }

      transaction.set(listRef, {
        listDetails: {
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          ...value,
          createdBy: decodedToken.uid
        }
      });
    });

    return reply.code(201).send({
      success: true,
      data: {
        listId: id,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      },
      message: `List ${id} created successfully`
    });

  } catch (error) {
    console.error("🔥 Error creating list:", error);
    return reply.code(500).send({
      success: false,
      message: error.message || "Internal server error"
    });
  }
}



export async function fetchlists(request, reply) {
    try {
        const { auth, db, admin } = await import('./firebaseServices.js');
        const { getClassDetailsByUID } = await import('./utils.js');
        const Joi = (await import('joi')).default;

        const token = request.headers.authorization?.split("Bearer ")[1];
        if (!token) return reply.code(401).send({ error: "Unauthorized" });
        const decodedToken = await auth.verifyIdToken(token);
        const classDetails = await getClassDetailsByUID(decodedToken.uid);

        const listsRef = db.collection("schools").doc(classDetails.universityId)
                        .collection("faculties").doc(classDetails.facultyId)
                        .collection("departments").doc(classDetails.departmentId)
                        .collection("classes").doc(classDetails.classId)
                        .collection("lists");

        let query = listsRef.orderBy("listDetails.createdAt", "desc");
        
        const snapshot = await query.get();
        
        const lists = [];
        snapshot.forEach(doc => {
            lists.push({
                id: doc.id,
                ...doc.data().listDetails,
            });
        });

        // Get total count for pagination
        const totalSnapshot = await query.count().get();
        const total = totalSnapshot.data().count;

        return reply.code(200).send({
            success: true,
            data: lists,
            total
        });

    } catch (error) {
        console.error("Error fetching lists:", error);
        return reply.code(500).send({
            success: false,
            message: "Failed to fetch lists"
        });
    }
}


export async function editlist(request, reply) {     
    try {
        const { auth, db, admin } = await import('./firebaseServices.js');
        const { getClassDetailsByUID } = await import('./utils.js');
        const Joi = (await import('joi')).default;

        const token = request.headers.authorization?.split("Bearer ")[1];
        if (!token) return reply.code(401).send({ error: "Unauthorized" });
        
        const decodedToken = await auth.verifyIdToken(token);
        const classDetails = await getClassDetailsByUID(decodedToken.uid);
        const { listId, updates } = request.body;

        // Validation schema for updates
        const schema = Joi.object({
            name: Joi.string().min(3).max(100),
            id: Joi.string().regex(/^[a-zA-Z0-9_\-]+$/).min(3).max(20),
            description: Joi.string().max(1000).allow(''),
            listBatch: Joi.string().max(50).allow(''),
            isCompulsory: Joi.boolean(),
            status: Joi.string().valid('active', 'inactive', 'pending')
        }).min(1);

        const { error, value } = schema.validate(updates);
        if (error) {
            return reply.code(400).send({
                success: false,
                error: error.details[0].message
            });
        }

        const listRef = db.collection("schools").doc(classDetails.universityId)
                        .collection("faculties").doc(classDetails.facultyId)
                        .collection("departments").doc(classDetails.departmentId)
                        .collection("classes").doc(classDetails.classId)
                        .collection("lists").doc(listId.toLowerCase());

        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(listRef);
            if (!doc.exists) {
                throw new Error('list not found');
            }
            
            const updateObject = {};
            
            // Build listDetails updates
            for (const [key, val] of Object.entries(value)) {
                updateObject[`listDetails.${key}`] = val;
            }
            
            // Add metadata fields
            updateObject['listDetails.updatedAt'] = admin.firestore.FieldValue.serverTimestamp();
            updateObject['listDetails.updatedBy'] = decodedToken.uid;

            transaction.update(listRef, updateObject);
        });

        return reply.code(200).send({
            success: true,
            data: {
                listId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            message: "list updated successfully"
        });

    } catch (error) {
        console.error("Error updating list:", error);
        return reply.code(error.message === 'list not found' ? 404 : 500).send({
            success: false,
            message: error.message || "Failed to update list"
        });
    }
}


export async function deletelist(request, reply) {
    try {
        const { auth, db, admin } = await import('./firebaseServices.js');
        const { getClassDetailsByUID } = await import('./utils.js');
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
        const { listId } = request.body;
        if (!listId) {
            return reply.code(400).send({ error: "list ID is required" });
        }

        // Get references
        const listRef = db.collection("schools").doc(classDetails.universityId)
                        .collection("faculties").doc(classDetails.facultyId)
                        .collection("departments").doc(classDetails.departmentId)
                        .collection("classes").doc(classDetails.classId)
                        .collection("lists").doc(listId);   

        // Check if list exists
        const listDoc = await listRef.get();
        if (!listDoc.exists) {
            return reply.code(404).send({
                success: false,
                message: "list not found"
            });
        }
        await db.runTransaction(async (transaction) => {
            transaction.delete(listRef);
        });

        return reply.code(200).send({
            success: true,
            data: {
                listId,
                deletedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            message: "list deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting list:", error);
        return reply.code(500).send({
            success: false,
            message: "An unexpected error occurred while deleting the list"
        });
    }
}


export async function listRecords(request, reply) {
  try {
    const { auth, db, admin } = await import('./firebaseServices.js');
    const { getClassDetailsByUID } = await import('./utils.js');
    const Joi = (await import('joi')).default;
    
    const token = request.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return reply.code(401).send({ success: false, error: "Unauthorized" });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const classDetails = await getClassDetailsByUID(decodedToken.uid);

    if (!classDetails) {
      return reply.code(403).send({ success: false, error: "No class assigned to user" });
    }

    const { listId } = request.body;
    if (!listId) {
      return reply.code(400).send({ success: false, message: "List ID required" });
    }

    const listRef = db.collection("schools").doc(classDetails.universityId)
      .collection("faculties").doc(classDetails.facultyId)
      .collection("departments").doc(classDetails.departmentId)
      .collection("classes").doc(classDetails.classId)
      .collection("lists").doc(listId)
      .collection("records");

    const snapshot = await listRef.get();

    if (snapshot.empty) {
      return reply.code(200).send({ success: true, records: [] });
    }

    const records = [];
    snapshot.forEach(doc => records.push({ id: doc.id, ...doc.data() }));

    return reply.code(200).send({
      success: true,
      message: "List records fetched successfully",
      records
    });

  } catch (error) {
    console.error("Error in listRecords:", error);
    return reply.code(500).send({
      success: false,
      message: "Error fetching list records"
    });
  }
}
