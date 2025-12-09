import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from "firebase-functions/v2/scheduler";
import fastify from 'fastify';
import * as logger from "firebase-functions/logger";
import { admin, auth, db } from "./firebaseServices.js";
import { exportClassMembersPdf, exportDuePdf, exportListPdf } from "./reportGeneration.js";
import { confirmDueReciept, createDue, deleteDue, dueRecords, editDue, fetchDues } from "./duesManager.js";
import { getClassDues, getClassLists, getProfile, joinList } from "./portal.js";
import { addnuban, cancelPayment, checkPaymentStatus, checkPaymentTimeout, getPortalPayment, paymentWebhook, runTimeoutProcessor } from "./payment.js";
import { getClassDetailsByUID } from "./utils.js"
import { createlist, deletelist, editlist, fetchlists, listRecords} from "./listsManager.js";
import { makeWithdrawal, setWithdrawalAccount } from './disbursement.js';
import { telegramWebhook, verifierCourseRep } from './telegramBot/bot.js';


const app = fastify({
  logger: false
});

app.addContentTypeParser("application/json", {}, (req, payload, done) => {
  req.rawBody = payload.rawBody;
  done(null, payload.body);
});

app.get('/', async (request, reply) => {
  reply.send({ message: '✅ Fastify is working!' });
});

app.get('/test', async (request, reply) => {
  reply.send({ message: 'Test Successful! ✅ Fastify is working!' , success: true});
});


app.post("/verify-token", async (request, reply) => {
  try {
    const token = request.headers.authorization?.split("Bearer ")[1];
    if (!token) return reply.code(401).send({ error: "Unauthorized" });

    const decodedToken = await auth.verifyIdToken(token);
    return reply.send({
      success: true,
      uid: decodedToken.uid,
      email: decodedToken.email,
      message: "Login Successful!",
    });
  } catch (error) {
    logger.error("Error verifying token", error);
    return reply.code(401).send({ error: "Invalid token" });
  }
});


app.post("/signup", async (request, reply) => {
  try {
    const { payload } = request.body;
    if (!payload) {
      logger.info("Missing payload"); // Log
      return reply.code(400).send({
        success: false,
        message: "Missing payload in request Body",
      });
    }
    let missingFields = [];
    const { fname, onames, email, phone, password, regno, role } = payload;

    // Check for empty or undefined fields and add their names to missingFields
    if (!fname) missingFields.push("fname");
    if (!email) missingFields.push("email");
    if (!phone) missingFields.push("phone");
    if (!password) missingFields.push("password");
    if (!regno) missingFields.push("regno");
    if (!role) missingFields.push("role");
    if (!onames) missingFields.push("onames");

    // ... (rest of your existing code remains the same) ...
    if (missingFields.length > 0) {
      logger.info(`Missing fields: ${missingFields.join(", ")}`); // Log
      return reply.code(400).send({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    const Id = (parseInt(phone)).toString();
    const fullname = `${fname} ${onames}`;

    logger.info("Checking for existing phone and email..."); // Log
    const [phoneExists, emailExists] = await Promise.all([
      auth.getUser(Id).catch(() => {
        logger.warn(`auth.getUser(${Id}) failed or not found.`); // Log error
        return null;
      }),
      auth.getUserByEmail(email).catch(() => {
        logger.warn(`auth.getUserByEmail(${email}) failed or not found.`); // Log error
        return null;
      }),
    ]);
    logger.info(`Phone exists: ${!!phoneExists}, Email exists: ${!!emailExists}`); // Log result

    if (phoneExists) {
      logger.info(`Phone number ${phone} already registered.`); // Log
      return reply.code(400).send({
        success: false,
        message: `Phone number ${phone} already registered`,
      });
    }

    if (emailExists) {
      logger.info(`Email ${email} already registered.`); // Log
      return reply.code(400).send({
        success: false,
        message: `Email ${email} already registered`,
      });
    }

    logger.info("Creating user in Firebase Auth..."); // Log
    await auth.createUser({
      uid: Id,
      email,
      password,
      displayName: fname,
    });
    logger.info("User created in Firebase Auth."); // Log

    logger.info("Creating user document in Firestore..."); // Log
    const userData = {
      personal: {
        uid: Id,
        email,
        displayName: fname,
        fullname,
        phone,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        regno,
        role,
        profileVerified: false,
        regDevice: {
          userIP: request.headers["x-forwarded-for"] || request.ip || "NaN",
          userAgent: request.headers["user-agent"] || "NaN",
        },
      },
      class: null
    };
    await db.collection(role === "cr" ? "course-reps" : "reps").doc(Id).set(userData);
    logger.info("User document created in Firestore."); // Log

    return reply.code(200).send({
      success: true,
      message: "Admin account created successfully",
    });
  } catch (error) {
    logger.error("Signup error in catch block:", error); // Use logger.error
    return reply.code(500).send({
      success: false,
      message: error.message || "Internal server error",
    });
  }
});

app.post("/addUniversity", async (request, reply) => {
  /* For testing purposes only as firestore data resets upon emulator restarting
  const token = request.headers.authorization?.split("Bearer ")[1];
  if (!token) return reply.code(401).send({ error: "Unauthorized" });
  const decodedToken = await auth.verifyIdToken(token);
  const uid = decodedToken.uid;
  if(!uid){
      return reply.status(401).send({ error: "Invalid authentication!" });
  }
  */
  try {
    const { universityName, universityId, regLen } = request.body;
    const universityRef = db.collection("schools").doc(universityId);
    
    await universityRef.set({
      name: universityName,
      id: universityId,
      regLen: regLen,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return reply.code(200).send({
      success: true,
      message: `University ${universityName} added successfully!`
    });
  } catch (error) {
    console.error("Error adding university:", error);
    return reply.code(500).send({ error: "Failed to add university" });
  }
});

app.post("/getSection", async (request, reply) => {
  const { section, universityId, facultyId, departmentId } = request.body;
  
  if (!section) {
    return reply.code(400).send({
      error: "Missing required fields!",
      body: request.body
    });
  }

  try {
    let queryRef, results = [];

    switch (section) {
      case "universities":
        queryRef = db.collection("schools");
        break;
      case "faculties":
        if (!universityId) {
          return reply.code(400).send({ error: "universityId is required for faculties" });
        }
        queryRef = db.collection("schools").doc(universityId).collection("faculties");
        break;
      case "departments":
        if (!universityId || !facultyId) {
          return reply.code(400).send({ error: "universityId and facultyId are required for departments" });
        }
        queryRef = db.collection("schools").doc(universityId)
                   .collection("faculties").doc(facultyId).collection("departments");
        break;
      case "classes":
        if (!universityId || !facultyId || !departmentId) {
          return reply.code(400).send({ error: "universityId, facultyId and departmentId are required for classes" });
        }
        queryRef = db.collection("schools").doc(universityId)
                   .collection("faculties").doc(facultyId)
                   .collection("departments").doc(departmentId).collection("classes");
        break;
      default:
        return reply.code(400).send({ error: "Invalid section type" });
    }

    const snapshot = await queryRef.get();
    
    // Transform documents to match your expected format
    snapshot.forEach(doc => {
      const data = doc.data();
      let transformed = { Id: doc.id, ...data };
      results.push(transformed);
    });

    return reply.code(200).send({
      success: true,
      size: results.length,
      subSection: section,
      subSections: results
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    return reply.code(500).send({ 
      success: false,
      error: "Failed to retrieve data",
      details: error.message 
    });
  }
});

app.post("/addSection", async (request, reply) => {
    const token = request.headers.authorization?.split("Bearer ")[1];
    if (!token) return reply.code(401).send({ error: "Unauthorized" });
  
    try {
      const decodedToken = await auth.verifyIdToken(token);
      const uid = decodedToken.uid;
  
      if (!uid) {
        return reply.code(401).send({ error: "Invalid authentication!" });
      }
  

      const { universityId, facultyId, sectionId, sectionName } = request.body;
      console.log("Body of request:", request.body);
      console.log(request.body);
      if (!universityId || !sectionId || !sectionName) {
        return reply.code(400).send({
          error: "Missing required fields!",
          body: request.body
        });
      }
      const section = !facultyId ? "faculty" : "department";
  
      // ------------------------
      // 💡 Add Faculty
      // ------------------------
      if (section == "faculty") {
        const facultyRefId = `${universityId}-${sectionId}`;
        const facultyRef = db.collection("schools").doc(universityId)
                      .collection("faculties").doc(sectionId);
        const facultyDoc = await facultyRef.get();
        if (facultyDoc.exists) {
          return reply.code(409).send({
            success: false,
            message: `Faculty -${sectionName}- (${sectionId.toUpperCase()}) in ${universityId.toUpperCase()} already exists!`
          });
        }
        // Create faculty
        await facultyRef.set({
          facultyName: sectionName,
          facultyId: sectionId.toLowerCase(),
          facultyRef: facultyRefId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          addedBy: uid
        });
        return reply.code(200).send({
          success: true,
          message: `${section} -${sectionName}- (${sectionId.toUpperCase()}) in ${universityId.toUpperCase()} has been successfully added!`
        });
      }
  
      // ------------------------
      // 💡 Add Department
      // ------------------------
      else if(section == "department") {
        const departmentRefId = `${universityId}-${facultyId}-${sectionId}`;
        const departmentRef = db.collection("schools").doc(universityId)
                         .collection("faculties").doc(facultyId)
                         .collection("departments").doc(sectionId);
        const departmentDoc = await departmentRef.get();
  
        if (departmentDoc.exists) {
          return reply.code(409).send({
            success: false,
            message: `Department -${sectionName}- (${sectionId.toUpperCase()}) in ${facultyId.toUpperCase()} already exists!`
          });
        }
  
        // Create department
        await departmentRef.set({
          departmentName: sectionName,
          departmentId: sectionId.toLowerCase(),
          facultyId,
          departmentRef: departmentRefId,
          universityId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          addedBy: uid
        });
        
        return reply.code(200).send({
          success: true,
          message: `${section} -${sectionName}- (${sectionId.toUpperCase()}) in ${facultyId.toUpperCase()} has been successfully added!`
        });
      }else{
        return reply.code(400).send({
            success: false,
            message: `couldn't identify action for section type -${section}!`
          });
      }
    } catch (error) {
      console.error("Error adding section:", error);
      return reply.code(500).send({
        success: false,
        message: `Error adding section: ${error.message}`
      });
    }
});  

app.post("/createClass", async (request, reply) => {
  const token = request.headers.authorization?.split("Bearer ")[1];
  if (!token) return reply.code(401).send({ error: "Unauthorized" });
  let regno;
  try {
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;

    if (!uid) {
      return reply.code(401).send({ error: "Invalid authentication!" });
    }
    
    const {universityId, facultyId, departmentId, theClass} = request.body;

    if (!theClass || !departmentId || !facultyId || !universityId) {
      return reply.code(400).send({
        error: "Missing required fields!",
        body: request.body
      });
    }

    const facultyDoc = await db.collection("schools").doc(universityId)
    .collection("faculties").doc(facultyId)
    .collection("departments").doc(departmentId).get()
    const departmentName = facultyDoc.exists && facultyDoc.data()?.departmentName;
    const classId = departmentId+"-"+theClass;
    const curClass = classId.trim()
                            .replace(/\//g, '-')
                            .toLowerCase();

    const userDoc = await db.collection("course-reps").doc(uid).get();
    if (!userDoc.exists || !userDoc.data().personal?.regno) {
      return reply.code(400).send({ error: "User registration data not found" });
    }
    const personalDetails = userDoc.data().personal;
    regno = personalDetails.regno;

    const generalClassRefId = `${universityId}-${facultyId}-${departmentId}-${curClass}`;
    

    const classRef = db.collection("schools").doc(universityId)
                     .collection("faculties").doc(facultyId)
                     .collection("departments").doc(departmentId)
                     .collection("classes").doc(curClass);
    const classDoc = await classRef.get(); 

    if (classDoc.exists) {
      return reply.code(409).send({
          success: false,
          message: `Class "${curClass.toUpperCase()}" already exists in Department "${departmentName}" of Faculty "${facultyId.toUpperCase()}"`,
        });
      } else {
          const universityNameRef = await db.collection("schools").doc(universityId).get();
          const universityName = universityNameRef.data().name;

          const facultyNameRef = await db.collection("schools").doc(universityId)
                                   .collection("faculties").doc(facultyId).get();
          const facultyName = facultyNameRef.data().facultyName;

          await classRef.set({
            departmentId,
            classId: curClass,
            className: (curClass).toUpperCase(),
            generalClassRefId,
            departmentName,
            facultyId,
            facultyName,
            addedBy: uid,
            universityId,
            universityName,
            balances: {
                      mainBalance: 0
                  },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          const classListRef = db.collection("schools").doc(universityId)
                     .collection("faculties").doc(facultyId)
                     .collection("departments").doc(departmentId)
                     .collection("classes").doc(curClass)
                     .collection("classMembers").doc(personalDetails.regno);

          await classListRef.set({
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            name: personalDetails.fullname.toUpperCase(),
            email: personalDetails.email,
            regno: personalDetails.regno,
            phone: personalDetails.phone,
            departmentId,
            classId: curClass,
            className: (curClass).toUpperCase(),
            departmentName,
            generalClassRefId,
            facultyId,
            universityId,
            profileVerified: true
          });


          await db.collection("course-reps").doc(uid).update({
              "class": {
                  departmentId,
                  classId: curClass,
                  className: curClass,
                  departmentName: departmentName || null,
                  generalClassRefId,
                  facultyId,
                  facultyName,
                  addedBy: uid,
                  universityId,
                  universityName,
                  createdAt: admin.firestore.FieldValue.serverTimestamp()
              }
          });
          
          const studentRef = db.collection("schools")
          .doc(universityId)
          .collection("studentProfiles")
          .doc(regno);

          await studentRef.set({
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            name: personalDetails.fullname.toUpperCase(),
            email: personalDetails.email,
            regno: personalDetails.regno,
            phone: personalDetails.phone,
            departmentId,
            classId: curClass,
            className: curClass,
            departmentName,
            generalClassRefId,
            facultyId,
            universityId,
            profileVerified: true
          });

          await verifierCourseRep("profile", 
            {
              uid, 
              departmentName: departmentName,
              facultyName: facultyName,
              universityName: universityName,
              name: personalDetails.fullname,
              phone: personalDetails.phone,
              role: "cr"
            });
            logger.info(`Class "${curClass.toUpperCase()}" added successfully to "${departmentId.toUpperCase()}" in "${facultyId.toUpperCase()}"`);
          return reply.code(200).send({
              success: true,
              message: `Class "${curClass.toUpperCase()}" added successfully to "${departmentId.toUpperCase()}" in "${facultyId.toUpperCase()}"`,
          });          
      }
  } catch (error) {
      console.error("Error creating class:", error);
      return reply.code(500).send({
        success: false,
        message: `Error Creating class: ${error.message}`
      });
  }
});


app.post("/createProfile", async(request, reply) => {
  let client;
  let classDetails;
  const token = request.headers.authorization?.split("Bearer ")[1];
  let uid;
  if(token){
    const decodedToken = await auth.verifyIdToken(token);
    uid = decodedToken.uid;
  }   
  if(token){
    client = uid;
  }else if (!token) client = "student";
  console.log( `Profile creation activity started, Client is ${client}`);
  const {fname, onames, email, phone, regno, classId} = request.body.payload;
  
   if (!fname || !onames || !email || !phone || !regno || !classId) {
    return reply.code(400).send({
      error: "Missing required fields! Kindly ensure all fields are filled!",
      body: request.body
    });
  }
  if(client === "student"){
    classDetails = request.body.payload;
  }
  if(client != "student" /* Meaning action is by Admin/ CR*/){
    const preDetails = await getClassDetailsByUID(uid);
    classDetails = preDetails;
    console.log(classDetails);
  }
  const generalClassRefId = `${classDetails.universityId}-${classDetails.facultyId}-${classDetails.departmentId}-${classDetails.classId}`;
    try {
    console.log(`UniversityId is ${classDetails.universityId}, and regno is ${regno}`);
    const studentRef = db.collection("schools")
      .doc(classDetails.universityId)
      .collection("studentProfiles")
      .doc(regno);
    // Check existence
    if ((await studentRef.get()).exists) {
      const universityName = (await db.collection("schools").doc(classDetails.universityId).get()).data().name;
      return reply.code(409).send({ 
        success: false,
        message: `Profile for Reg. No.=> ${regno} already exists in ${universityName}!`
      });
    }
  
    
    const facultyDoc = await db.collection("schools").doc(classDetails.universityId)
    .collection("faculties").doc(classDetails.facultyId)
    .collection("departments").doc(classDetails.departmentId).get()
    const departmentName = facultyDoc.exists && facultyDoc.data()?.departmentName;
    classDetails.departmentName = client == "student" ? departmentName : classDetails.departmentName
    const classListRef = db.collection("schools").doc(classDetails.universityId)
                    .collection("faculties").doc(classDetails.facultyId)
                    .collection("departments").doc(classDetails.departmentId)
                    .collection("classes").doc(classId)
                    .collection("classMembers").doc(regno);

    const studentData = {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      name: `${(fname+" "+onames).toUpperCase()}`,
      email,
      regno,
      phone,
      departmentId: classDetails.departmentId,
      departmentName: classDetails.departmentName,
      classId: classDetails.classId,
      generalClassRefId: generalClassRefId,
      facultyId: classDetails.facultyId,
      universityId: classDetails.universityId,
      profileVerified: client == "student" ? false : true
    };
    // Create profile
    await Promise.all([
      studentRef.set(studentData),
      classListRef.set(studentData)
    ]);
    if(client == "student"){
      return reply.code(201).send({
      success: true,
      message: `Student profile for ${fname} ${onames} has been created successfully and awaiting verification by Course-Representative!`
    });
    }
    return reply.code(201).send({
      success: true,
      message: `Student profile for ${fname} ${onames} has been created successfully!`
    });
  
  } catch (error) {
    console.error("Profile creation error:", error);
    return reply.code(500).send({
      success: false,
      message: "Internal server error creating profile"
    });
  }
});

app.post("/dashboard", async (request, reply) => {
    const token = request.headers.authorization?.split("Bearer ")[1];
    if (!token) return reply.code(401).send({ error: "Unauthorized" });
    try {
      const decodedToken = await auth.verifyIdToken(token);
      const uid = decodedToken.uid;
  
      if (!uid) {
        return reply.code(401).send({ error: "Invalid authentication!" });
      }
        const details = await getClassDetailsByUID(uid);
        const profileVerified = details.profileVerified;
        const classRef = db.collection("schools").doc(details.universityId)
                        .collection("faculties").doc(details.facultyId)
                        .collection("departments").doc(details.departmentId)
                        .collection("classes").doc(details.classId);
        const classDoc = await classRef.get(); 
        if (!classDoc.exists) {
        return reply.status(404).json({ success: false, message: "Class not found!" });
        }
        const classDetails = classDoc.data();
        const className = classDetails.className || "(CLASS NAme)";
        const mainBalance = classDetails.balances.mainBalance;
        const disbursment = classDetails.disbursment ? true : false;
        const disbursementDetails = classDetails.disbursment;
        const departmentName = classDetails.departmentName || null;

        const transactionRef = classRef.collection("transactions")
                                       .orderBy("createdAt");
        const snapshot = await transactionRef.get();
        const transactions = [];

        if (snapshot.empty) {
          logger.log("No Transactions yet!");
        }else {
          snapshot.forEach(doc => {
            transactions.push({ id: doc.id, ...doc.data() });
          });
        }

        return reply.status(200).send({ 
            success: true, 
            details: {className, mainBalance, disbursment, departmentName, profileVerified},
            disbursementDetails,
            recentTransactions: transactions 
        });
    } catch (error) {
        console.error("Error fetching dashboard details:", error);
        return reply.status(500).send({ success: false, message: "Server error" });
    }
});

app.post("/getClassMembers", async (request, reply) => {
  try {
    const token = request.headers.authorization?.split("Bearer ")[1];
    if (!token) return reply.code(401).send({ error: "Unauthorized" });
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    let classMeta = {};
    
    const { category } = request.body;

    const accountRef = await db.collection("course-reps").doc(uid).get();
    const data = accountRef.data();
    classMeta = data.class;
    
    // Validate input
    if (!classMeta.universityId || !classMeta.facultyId || !classMeta.departmentId || !classMeta.classId) {
      return reply.code(400).send({ 
        success: false,
        error: "Missing required parameters",
        body: data
      });
    }

    // Base query
    let membersQuery = db.collection("schools").doc(classMeta.universityId)
                       .collection("faculties").doc(classMeta.facultyId)
                       .collection("departments").doc(classMeta.departmentId)
                       .collection("classes").doc(classMeta.classId)
                       .collection("classMembers")
                       .orderBy("createdAt");

    // Add verified filter if requested
    if (category == "verified") {
      membersQuery = membersQuery.where("profileVerified", "==", true);
    }if (category == "notVerified") {
      membersQuery = membersQuery.where("profileVerified", "==", false);
    }

    const snapshot = await membersQuery.get();
    
    let serialNumber = 1;
    const members = [];
    
    snapshot.forEach(doc => {
      const memberData = doc.data();
      members.push({
        sn: serialNumber++,
        id: doc.id,
        ...memberData,
        registrationDate: memberData.createdAt?.toDate().toLocaleString() || 'N/A'
      });
    });

    return reply.code(200).send({
      success: true,
      members,
      total: members.length,
      classMeta
    });

  } catch (error) {
    console.error("Error fetching class members:", error);
    return reply.code(500).send({
      success: false,
      error: "Failed to fetch class members",
      details: error.message
    });
  }
});

app.post("/approveProfile", async (request, reply) => {
  // Start log with request details
  logger.log("Profile approval request received", {
    method: request.method,
    path: request.url,
    ip: request.ip,
    headers: {
      "user-agent": request.headers['user-agent'],
      "content-type": request.headers['content-type']
    }
  });

  try {
    // Authentication
    const token = request.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      logger.warn("Unauthorized access attempt - missing token");
      return reply.status(401).send({ error: "Unauthorized" });
    }

    // Token verification
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
      logger.info("Token verified successfully", {
        uid: decodedToken.uid,
        tokenIssued: new Date(decodedToken.iat * 1000).toISOString()
      });
    } catch (error) {
      logger.error("Token verification failed", {
        error: error.message,
        stack: error.stack
      });
      return reply.status(401).send({ error: "Invalid token" });
    }

    const uid = decodedToken.uid;
    
    // Get class details
    let classMeta;
    try {
      classMeta = await getClassDetailsByUID(uid);
      logger.info("Retrieved class metadata", {
        universityId: classMeta.universityId,
        classId: classMeta.classId
      });
    } catch (error) {
      logger.error("Failed to retrieve class details", {
        uid,
        error: error.message
      });
      return reply.status(500).send({ error: "Failed to retrieve class information" });
    }

    // Input validation
    const { id, approve } = request.body;
    
    if (typeof id !== "string" || id.trim() === "") {
      logger.warn("Invalid profile ID provided", {
        providedId: id,
        approveFlag: approve
      });
      return reply.status(400).send({ error: "Invalid profile ID" });
    }
    if (typeof approve !== "string" || (approve !== "true" && approve !== "false")) {
      logger.warn("Invalid approval flag provided", { approve });
      return reply.status(400).send({ error: "Invalid approval flag" });
    }

    logger.info(`Processing ${approve == "true" ? "approval" : "denial"} for profile`, {
      profileId: id,
      actionBy: uid
    });

    // Get profile references
    const profileInClassRef = db.collection("schools").doc(classMeta.universityId)
      .collection("faculties").doc(classMeta.facultyId)
      .collection("departments").doc(classMeta.departmentId)
      .collection("classes").doc(classMeta.classId)
      .collection("classMembers").doc(id);

    const profileInSchoolRef = db.collection("schools").doc(classMeta.universityId)
      .collection("studentProfiles").doc(id);

    // Check profile existence
    const [classProfile, schoolProfile] = await Promise.all([
      profileInClassRef.get(),
      profileInSchoolRef.get()
    ]);

    if (!classProfile.exists || !schoolProfile.exists) {
      logger.error("Profile not found in one or both collections", {
        profileId: id,
        existsInClass: classProfile.exists,
        existsInSchool: schoolProfile.exists
      });
      return reply.status(404).send({ error: "Profile not found" });
    }

    // Approval flow
    if (approve == "true") {
      const updateData = {
        profileVerified: true,
        verifiedBy: uid,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      try {
        await Promise.all([
          profileInClassRef.update(updateData),
          profileInSchoolRef.update(updateData)
        ]);
        
        logger.log("Profile approved successfully", {
          profileId: id,
          approvedBy: uid,
          updateData
        });
        
        return reply.status(200).send({
          success: true,
          message: "Profile approved",
          data: updateData
        });
      } catch (error) {
        logger.error("Failed to update profile during approval", {
          profileId: id,
          error: error.message,
          stack: error.stack
        });
        return reply.status(500).send({ error: "Approval update failed" });
      }
    } else {
      try {
        // Create audit record first
        const profileData = {
          ...classProfile.data(),
          ...schoolProfile.data(),
          deniedBy: uid,
          deniedAt: admin.firestore.FieldValue.serverTimestamp(),
          originalCollections: [
            `schools/${classMeta.universityId}/faculties/${classMeta.facultyId}/departments/${classMeta.departmentId}/classes/${classMeta.classId}/classMembers`,
            `schools/${classMeta.universityId}/studentProfiles`
          ]
        };

        await db.collection("deniedProfiles").doc(id).set(profileData);
        
        // Then delete from active collections
        await Promise.all([
          profileInClassRef.delete(),
          profileInSchoolRef.delete()
        ]);

        logger.warn("Profile denied and removed", {
          profileId: id,
          deniedBy: uid,
          auditRecordCreated: true
        });

        return reply.status(200).send({
          success: true,
          message: "Profile denied and removed",
          data: {
            deniedAt: new Date().toISOString()
          }
        });
      } catch (error) {
        logger.error("Failed during profile denial", {
          profileId: id,
          error: error.message,
          stack: error.stack
        });
        return reply.status(500).send({ error: "Denial process failed" });
      }
    }
  } catch (error) {
    logger.error("Unexpected error in approval endpoint", {
      error: error.message,
      stack: error.stack,
      requestBody: request.body,
      headers: request.headers
    });
    return reply.status(500).send({ error: "Internal server error" });
  }
});

app.post("/exportClassMembersPdf", exportClassMembersPdf);
app.post("/createDue", createDue);
app.get("/fetchDues", fetchDues);
app.post("/editDue", editDue);
app.post("/deleteDue", deleteDue);
app.post("/getProfile", getProfile);
app.post("/getClassDues", getClassDues);
app.post("/getPortalPayment", getPortalPayment);
app.post("/addnuban", addnuban);
app.post("/paymentWebhook", paymentWebhook);
app.post("/checkPaymentTimeout", checkPaymentTimeout);
app.post("/cancelPayment", cancelPayment);
app.get('/checkPaymentStatus/:accountNumber', checkPaymentStatus);
app.post('/dueRecords', dueRecords);
app.post("/confirmDueReciept", confirmDueReciept);
app.post("/exportDuePdf", exportDuePdf);
app.post("/createlist", createlist);
app.post("/editlist", editlist);
app.post("/deletelist", deletelist);
app.get("/fetchlists", fetchlists);
app.post("/getClassLists", getClassLists);
app.post("/joinList", joinList);
app.post("/listRecords", listRecords);
app.post("/exportListPdf", exportListPdf);
app.post("/setWithdrawalAccount", setWithdrawalAccount);
app.post("/telegramWebhook", telegramWebhook);
app.post("/makeWithdrawal", makeWithdrawal);


export const scheduledPaymentTimeoutChecker = onSchedule("every 10 minutes", async (event) => {
    await runTimeoutProcessor();
});


const fastifyHandler = async (req, res) => {
  try {
    // Remove the /api prefix if present
    req.url = req.url.replace(/^\/api/, '');
    await app.ready();
    app.server.emit('request', req, res);
  } catch (err) {
    console.error('🔥 Fastify Handler Error:', err);
    res.status(500).send('Internal Server Error');
  }
};

// Export to Firebase
export const api = onRequest({
  region: 'us-central1',
  invoker: 'public'
}, fastifyHandler);

// Local dev
if (!process.env.K_SERVICE && !process.env.FUNCTION_NAME) {
  const PORT = parseInt(process.env.PORT || '3000', 10);
  app.listen({ port: PORT }, (err) => {
    if (err) throw err;
    console.log(`🛠️ Local Fastify running at http://localhost:${PORT}`);
  });
}
