import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import admin from "firebase-admin";
import fastify from "fastify";
import { request } from "express";

// Initialize Firebase Admin SDK
admin.initializeApp();
const auth = admin.auth();
const db = admin.firestore();

// Create and configure Fastify app once
const app = fastify({
  logger: false,
});

// Register content-type parser only once
app.addContentTypeParser("application/json", {}, (req, payload, done) => {
  req.rawBody = payload.rawBody;
  done(null, payload.body);
});

// Define routes once
app.get("/", async (request, reply) => {
  reply.send({ message: "Hello World!" });
});

app.post("/api/verify-token", async (request, reply) => {
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

app.post("/api/signup", async (request, reply) => {
  try {
    const { payload } = request.body;
    if (!payload) {
      return reply.code(400).send({
        success: false,
        message: "Missing payload in request body",
      });
    }

    const { fname, onames, email, phone, password, regno, role } = payload;
    const missingFields = [];
    if (!fname) missingFields.push("fname");
    if (!email) missingFields.push("email");
    if (!phone) missingFields.push("phone");
    if (!password) missingFields.push("password");
    if (!regno) missingFields.push("regno");
    if (!role) missingFields.push("role");

    if (missingFields.length > 0) {
      return reply.code(400).send({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    const Id = (parseInt(phone)).toString();
    const fullname = `${fname} ${onames}`;

    const [phoneExists, emailExists] = await Promise.all([
      auth.getUser(Id).catch(() => null),
      auth.getUserByEmail(email).catch(() => null),
    ]);

    if (phoneExists) {
      return reply.code(400).send({
        success: false,
        message: `Phone number ${phone} already registered`,
      });
    }

    if (emailExists) {
      return reply.code(400).send({
        success: false,
        message: `Email ${email} already registered`,
      });
    }

    if (!/^\d{11}$/.test(phone)) {
      return reply.code(400).send({
        success: false,
        message: "Phone must be 11 digits",
      });
    }

    // Create user in auth system
    await auth.createUser({
      uid: Id,
      email,
      password,
      displayName: fname,
    });

    // Create user document with proper nested structure
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
        regDevice: {
          userIP: request.headers["x-forwarded-for"] || request.ip || "NaN",
          userAgent: request.headers["user-agent"] || "NaN",
        },
      },
      // Initialize empty class object that will be filled later
      class: null
    };

    await db.collection(role === "cr" ? "course-reps" : "reps").doc(Id).set(userData);

    return reply.code(200).send({
      success: true,
      message: "User created successfully",
    });
  } catch (error) {
    console.error("Signup error:", error);
    return reply.code(500).send({
      success: false,
      message: error.message || "Internal server error",
    });
  }
});
app.post("/api/addUniversity", async(request, reply) => {
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
        const {universityName, universityId} = request.body;
        const universityRef = db.collection('universities').doc(universityId.toString().toLowerCase());
            await universityRef.set({
                name: universityName,
                Id: universityId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            }, {merge: true});
            await db.collection('records').doc('allUniversities').set({
                [universityId]:{
                name: universityName,
                Id: universityId
                }
            })
        console.log(`University ${universityName} successfully added!`);
        return reply.code(200).send({
          success: true,
          message: `University ${universityName} successfully added!`
        })
    } catch (error) {
        console.error("Error Adding university:", error);
        return reply.code(500).send({ error: "Failed to retrieve section" });
      }

    // I'll finish up this function later, only for admins to add school.!
});


app.post("/api/getSection", async (request, reply) => {
    /*const token = request.headers.authorization?.split("Bearer ")[1];
    if (!token) return reply.code(401).send({ error: "Unauthorized" });
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    if(!uid){
        return reply.status(401).send({ error: "Invalid authentication!" });
    }*/
    const { section, parentId } = request.body;
    console.log(`Requested for ${section} under ${parentId}`);
    if(!section || (!parentId && section != "universities") ){
        return reply.code(400).send({
        error: "Missing required fields!",
        body: request.body
        });
    }

    try {
      let parentDoc;
      if(section == "universities"){
        parentDoc = await db.collection('records').doc('allUniversities').get();
        if (!parentDoc.exists) {
          return reply.code(404).send({ error: "University not found" });
        }
        const rawSections = parentDoc.data();
        console.log("Raw sections:");
        console.log(rawSections);
        const subSections = rawSections || {};
        console.log("Fetched sections:");
        console.log(subSections);
        const sectionsArray = Object.values(subSections);
    
        return reply.code(200).send({
          success: true,
          size: sectionsArray.length,
          subSection: section,
          subSections: sectionsArray
        });
       }else if(section == "faculties"){
        parentDoc = await db.collection('universities').doc(parentId).get();
        if (!parentDoc.exists) {
        return reply.code(404).send({ error: "Faculty(s) not found" });
        }
       }else if(section == "departments"){
        parentDoc = await db.collection('faculties').doc(parentId).get();
        if (!parentDoc.exists) {
          return reply.code(404).send({ error: "Department(s) not found" });
        }
       }
       else if(section == "classes"){
        parentDoc = await db.collection('departments').doc(parentId).get();
        if (!parentDoc.exists) {
          return reply.code(404).send({ error: "Department(s) not found" });
        }  
       }
        
  
       const rawSections = parentDoc.data()[section];
       console.log("Raw sections:");
       console.log(rawSections);
       const subSections = rawSections || {};
       console.log("Fetched sections:");
       console.log(subSections);
       const sectionsArray = Object.values(subSections);
  
      return reply.code(200).send({
        success: true,
        size: sectionsArray.length,
        subSection: section,
        subSections: sectionsArray
      });
  
    } catch (error) {
      console.error("Error fetching section:", error);
      return reply.code(500).send({ error: "Failed to retrieve section" });
    }
  });  

app.post("/api/addSection", async (request, reply) => {
    const token = request.headers.authorization?.split("Bearer ")[1];
    if (!token) return reply.code(401).send({ error: "Unauthorized" });
  
    try {
      const decodedToken = await auth.verifyIdToken(token);
      const uid = decodedToken.uid;
  
      if (!uid) {
        return reply.code(401).send({ error: "Invalid authentication!" });
      }
  
      const { section, sectionName, sectionId, faculty, university } = request.body;
      console.log("Body of request:", request.body);
      console.log(request.body);
      if (!section || !sectionName || !sectionId || !university) {
        return reply.code(400).send({
          error: "Missing required fields!",
          body: request.body
        });
      }
  
      // ------------------------
      // 💡 Add Faculty
      // ------------------------
      if (section == "faculty") {
        const facultyRefId = `${university}-${sectionId}`;
        const facultyRef = db.collection("faculties").doc(facultyRefId);
        const facultyDoc = await facultyRef.get();
  
        if (facultyDoc.exists) {
          return reply.code(409).send({
            success: false,
            message: `Faculty -${sectionName}- (${sectionId.toUpperCase()}) in ${university.toUpperCase()} already exists!`
          });
        }
  
        // Create faculty
        await facultyRef.set({
          facultyName: sectionName,
          facultyId: sectionId,
          facultyRef: facultyRefId,
          universityId: university,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          addedBy: uid
        });
  
        const universityRef = db.collection("universities").doc(university);
        await universityRef.set({
            "faculties": {
              [sectionId]: {
                facultyId: sectionId,
                facultyName: sectionName,
                addedBy: uid,
                facultyRefId: facultyRefId,
                universityId: university,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              }
            }
          }, { merge: true });
          
        return reply.code(200).send({
          success: true,
          message: `${section} -${sectionName}- (${sectionId.toUpperCase()}) in ${university.toUpperCase()} has been successfully added!`
        });
  
      }
  
      // ------------------------
      // 💡 Add Department
      // ------------------------
      else if(section == "department") {
        const departmentRefId = `${university}-${faculty}-${sectionId}`;
        const departmentRef = db.collection("departments").doc(departmentRefId);
        const departmentDoc = await departmentRef.get();
  
        if (departmentDoc.exists) {
          return reply.code(409).send({
            success: false,
            message: `Department -${sectionName}- (${sectionId.toUpperCase()}) in ${faculty.toUpperCase()} already exists!`
          });
        }
  
        // Create department
        await departmentRef.set({
          departmentName: sectionName,
          departmentId: sectionId,
          facultyId: faculty,
          departmentRef: departmentRefId,
          universityId: university,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          addedBy: uid
        });
        
        const facultyRefId = `${university}-${faculty}`;
        const facultyRef = db.collection("faculties").doc(facultyRefId);
        await facultyRef.set({
            departments: {
              [sectionId]: {
                facultyId: faculty,
                departmentName: sectionName,
                departmentId: sectionId,
                addedBy: uid,
                universityId: university,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              }
            }
          }, { merge: true });
        
        return reply.code(200).send({
          success: true,
          message: `${section} -${sectionName}- (${sectionId.toUpperCase()}) in ${faculty.toUpperCase()} has been successfully added!`
        });
      }else{
        return reply.code(400).send({
            success: false,
            message: `couldn't identify action for keyword -${section}!`
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

app.post("/api/createClass", async (request, reply) => {
  const token = request.headers.authorization?.split("Bearer ")[1];
  if (!token) return reply.code(401).send({ error: "Unauthorized" });
  let regno;
  try {
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;

    if (!uid) {
      return reply.code(401).send({ error: "Invalid authentication!" });
    }
    
    const {university, faculty, department, curClass} = request.body;

    if (!curClass || !department || !faculty || !university) {
      return reply.code(400).send({
        error: "Missing required fields!",
        body: request.body
      });
    }

    const userDoc = await db.collection("course-reps").doc(uid).get();
    if (!userDoc.exists || !userDoc.data().personal?.regno) {
      return reply.code(400).send({ error: "User registration data not found" });
    }
    const personalDetails = userDoc.data().personal;
    regno = personalDetails.regno;

    const generalClassRefId = `${university}-${faculty}-${department}-${curClass}`;
    const departmentRefId = `${university}-${faculty}-${department}`;
    const departmentDocRef = db.collection("departments").doc(departmentRefId);
    const departmentDoc = await departmentDocRef.get();
    
    if (departmentDoc.exists) {
      const existingClasses = departmentDoc.data().classes || {};
      if (existingClasses[curClass]) {
        return reply.code(409).send({
          success: false,
          message: `Class "${curClass.toUpperCase()}" already exists in Department "${department.toUpperCase()}" of Faculty "${faculty.toUpperCase()}"`,
        });
      } else {
          // Update department document
          await departmentDocRef.update({
              "classes": {
                [curClass]: {
                  classId: curClass,
                  className: (department+"-"+curClass).toUpperCase(),
                  generalClassRefId,
                  departmentId: department,
                  facultyId: faculty,
                  addedBy: uid,
                  universityId: university,
                  createdAt: admin.firestore.FieldValue.serverTimestamp()
              }
            }
          });

          // Get faculty data for department name
          const facultyDoc = await db.collection("faculties").doc(`${university}-${faculty}`).get();
          const departmentName = facultyDoc.exists && facultyDoc.data().departments?.[department]?.departmentName;

          // Update course-reps document using update() to preserve personal data
          await db.collection("course-reps").doc(uid).update({
              "class": {
                  department: department,
                  classId: curClass,
                  className: (department+"-"+curClass).toUpperCase(),
                  departmentName: departmentName || null,
                  generalClassRefId,
                  facultyId: faculty,
                  addedBy: uid,
                  universityId: university,
                  balances: {
                      mainBalance: 0
                  },
                  createdAt: admin.firestore.FieldValue.serverTimestamp()
              }
          });
          
          const studentRef = db.collection("universities")
          .doc(universityId)
          .collection("studentProfiles")
          .doc(regno);

          await studentRef.set({
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            name: personalDetails.fullname,
            email: personalDetails.email,
            regno: personalDetails.regno,
            phone: personalDetails.phone,
            departmentId: department,
            classId: curClass,
            className: (department+"-"+curClass).toUpperCase(),
            departmentName: departmentName || null,
            generalClassRefId,
            facultyId: faculty,
            universityId: university,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          return reply.code(200).send({
              success: true,
              message: `Class "${curClass.toUpperCase()}" added successfully to "${department.toUpperCase()}" in "${faculty.toUpperCase()}"`,
          });          
      }
    }
  } catch (error) {
      console.error("Error creating class:", error);
      return reply.code(500).send({
        success: false,
        message: `Error Creating class: ${error.message}`
      });
  }
});


app.post("/api/createProfile", async(request, reply) => {
  let client;
  const token = request.headers.authorization?.split("Bearer ")[1];
  if(token){
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    client = uid;
  }else if (!token) client = "student";
  const {fname, onames, email, phone, regno, universityId, facultyId, departmentId, classId} = request.body.payload;
  const generalClassRefId = `${universityId}-${facultyId}-${departmentId}-${classId}`;
   if (!fname || !onames || !email || !phone || !regno || !classId) {
    return reply.code(400).send({
      error: "Missing required fields! Kindly ensure all fields are filled!",
      body: request.body
    });
  }
    try {
      console.log(`UniversityId is ${universityId}, and regno is ${regno}`);
      const studentRef = db.collection("universities")
        .doc(universityId)
        .collection("studentProfiles")
        .doc(regno);
      // Check existence
      if ((await studentRef.get()).exists) {
        const universityName = (await db.collection("universities").doc(universityId).get()).data().name;
        return reply.code(409).send({ 
          success: false,
          message: `Profile for ${regno} already exists in ${universityName}!`
        });
      }
    
      
      const departmentDoc = await db.collection("departments").doc(`${universityId}-${facultyId}-${departmentId}`).get();
      const departmentName = departmentDoc.exists && departmentDoc.data().departmentName;
      
      // Create profile
      await studentRef.set({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        name: `${fname} ${onames}`,
        email,
        regno,
        phone,
        departmentId,
        departmentName: departmentName,
        classId,
        className: (`${departmentId}-${classId}`).toUpperCase(),
        generalClassRefId,
        facultyId,
        universityId
      });
    
      return reply.code(201).send({
        success: true,
        message: `Student profile for ${fname} ${onames} created successfully!`
      });
    
    } catch (error) {
      console.error("Profile creation error:", error);
      return reply.code(500).send({
        success: false,
        message: "Internal server error creating profile"
      });
    }
});

app.post("/api/dashboard", async (request, reply) => {
    const token = request.headers.authorization?.split("Bearer ")[1];
    if (!token) return reply.code(401).send({ error: "Unauthorized" });
    try {
      const decodedToken = await auth.verifyIdToken(token);
      const uid = decodedToken.uid;
  
      if (!uid) {
        return reply.code(401).send({ error: "Invalid authentication!" });
      }
        const classRefSnap = await db.collection("course-reps").doc(uid).get();
        if (!classRefSnap.exists) {
        return reply.status(404).json({ success: false, message: "Course Rep profile not found!" });
        }
        console.log("Retrieved Data");
        console.log(classRefSnap.data());
        const className = classRefSnap.data().class.className || null;
        const mainBalance = classRefSnap.data().class.balances.mainBalance;
        const departmentName = classRefSnap.data().class.departmentName || null;
        return reply.status(200).send({ 
            success: true, 
            details: {className, mainBalance, departmentName} 
        });
    } catch (error) {
        console.error("Error fetching dashboard details:", error);
        return reply.status(500).send({ success: false, message: "Server error" });
    }
});

// Firebase HTTPS handler that uses Fastify
export const api = onRequest(async (request, reply) => {
  await app.ready(); // Ensure routes are loaded
  app.server.emit("request", request, reply);
});
                    