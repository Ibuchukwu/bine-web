import path from "path";
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logoPath = path.resolve(__dirname, "assets", "logo.png");

// 🔁 Draw watermark function
// ✅ ES Module Compatible Watermark Drawer
export async function drawWatermark(doc, logoPath, style = "tiled") {
  const { readFile } = await import('fs/promises');

  let logoBuffer;
  try {
    logoBuffer = await readFile(logoPath);
  } catch (err) {
    console.error("Failed to load watermark image:", err);
    return; // Optional: skip watermark silently or throw error
  }

  doc.save();
  doc.opacity(0.07);

  if (style === "center") {
    doc.image(logoBuffer, doc.page.width / 4, doc.page.height / 3, { width: 300 });
  } else {
    const tileWidth = 60;
    for (let y = 0; y < doc.page.height; y += tileWidth + 40) {
      for (let x = 30; x < doc.page.width; x += tileWidth + 40) {
        doc.image(logoBuffer, x, y, { width: tileWidth });
      }
    }
  }

  doc.opacity(1);
  doc.restore();
}


export const exportClassMembersPdf = async function(request, reply) {
    try {
        const { getClassDetailsByUID, toCentralISOString } = await import('./utils.js');
        const { db, auth } = await import('./firebaseServices.js');
        const { PassThrough } = await import('stream');
        const PDFDocument = (await import('pdfkit')).default;
        // 1. Verify authentication and get class details
        const token = request.headers.authorization?.split("Bearer ")[1];
        if (!token) return reply.code(401).send({ error: "Unauthorized" });
        const decodedToken = await auth.verifyIdToken(token);
        const classDetails = await getClassDetailsByUID(decodedToken.uid);
        
        if (!classDetails.universityId || !classDetails.facultyId || !classDetails.departmentId || !classDetails.classId) {
          return reply.code(400).send({ error: "Missing required fields", body: classDetails });
        }
    
        // 2. Fetch class members
        const membersRef = db.collection("schools").doc(classDetails.universityId)
                          .collection("faculties").doc(classDetails.facultyId)
                          .collection("departments").doc(classDetails.departmentId)
                          .collection("classes").doc(classDetails.classId)
                          .collection("classMembers");
    
        const snapshot = await membersRef.orderBy("createdAt").get();
        const members = [];
        
        snapshot.forEach(doc => {
          const data = doc.data();
          members.push({
            regno: doc.id || "N/A",
            name: data.name || "N/A",
            phone: data.phone || "N/A",
            email: data.email || "N/A",
            dateRegistered: toCentralISOString(data.createdAt) || "N/A"
          });
        });
    
        // 3. Generate PDF with improved styling
        const doc = new PDFDocument({ 
        margin: 40, 
        size: 'A4',
        font: 'Helvetica',
        info: {
            Title: `Class Members - ${classDetails.classId}`,
            Author: 'School Management System'
        }
        });

        const chunks = [];
        const stream = doc.pipe(new PassThrough());

        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', (err) => {
        console.error('Stream error:', err);
        throw err;
        });

        // ✅ Draw watermark (call this early!)
        const logoPath = path.resolve(__dirname, "../assets", "logo.png"); // ✅ Correct path
        await drawWatermark(doc, logoPath, "tiled"); // ✅ Now properly called


    
        // ===== PDF CONTENT ===== //
        
        // Header
        doc.fillColor('#2c3e50') // Dark blue background
           .rect(0, 0, doc.page.width, 100)
           .fill();
           
        doc.fillColor('white')
           .fontSize(20)
           .text("Class Members Report", 40, 20);
           
        doc.fontSize(12)
           .text(`Class: ${classDetails.classId.toUpperCase()}`, 40, 50);
        
        // School information
        doc.fillColor('white')
           .fontSize(10)
           .text(`School: ${classDetails.universityName || 'N/A'}`, 250, 20, { align: 'right' })
           .text(`Faculty: ${classDetails.facultyName || 'N/A'}`, 250, 40, { align: 'right' })
           .text(`Department: ${classDetails.departmentName || 'N/A'}`, 250, 60, { align: 'right' })
           .text(`Generated on ${toCentralISOString(new Date())}`, 300, 80, { align: 'right' });
        
        // Table header
        doc.moveDown(2);
        const tableTop = 120;
        
        // Table header background
        doc.fillColor('#2c3e50')
           .rect(25, tableTop, doc.page.width - 50, 20)
           .fill();
        
        // Column headers
        doc.fillColor('white')
           .font('Helvetica-Bold')
           .fontSize(10)
           .text("S/N", 45, tableTop + 5)
           .text("Reg No", 90, tableTop + 5)
           .text("Name", 180, tableTop + 5)
           .text("Phone", 300, tableTop + 5)
           .text("Email", 400, tableTop + 5)
           .text("Registered on", 520, tableTop + 5);
        
        // Table rows
        doc.fillColor('black')
           .font('Helvetica')
           .fontSize(6);
        
        let y = tableTop + 25;
        members.forEach((member, index) => {
            // Alternate row colors
            if (index % 2 === 0) {
                doc.fillColor('#f5f5f5')
                   .rect(25, y - 5, doc.page.width - 50, 17)
                   .fill();
            }
            
            doc.fillColor('black')
               .text(`${index + 1}`, 45, y)
               .text(member.regno, 90, y)
               .text(member.name, 180, y)
               .text(member.phone, 300, y)
               .text(member.email, 400, y)
               .text(toCentralISOString(member.dateRegistered), 520, y);
            
            y += 15;
        });
        
        // Footer
        doc.fontSize(10)
           .text(`Total Members: ${members.length}`, 40, doc.page.height - 40)
    
        // ===== END CONTENT ===== //
        
        doc.end();
        // Wait for stream to finish
        await new Promise((resolve, reject) => {
            stream.on('end', resolve);
            stream.on('error', reject);
        });
        
        // Send response
        reply.type('application/pdf')
             .header('Content-Disposition', `attachment; filename=ClassMembers_${classDetails.classId}.pdf`)
             .send(Buffer.concat(chunks));
            
    } catch (error) {
        console.error("PDF Export Error:", error);
        reply.code(500).send({ 
            error: "Failed to generate PDF",
            details: error.message 
        });
    }
}

export const exportDuePdf = async function (request, reply) {
  try {
    const { getClassDetailsByUID, formatCurrency, toCentralISOString, getUnCharge } = await import('./utils.js');
    const { db, auth } = await import('./firebaseServices.js');
    const { PassThrough } = await import('stream');
    const PDFDocument = (await import('pdfkit')).default;

    const token = (request.headers.authorization || "").split("Bearer ")[1];
    if (!token) return reply.code(401).send({ error: "Unauthorized" });

    const decodedToken = await auth.verifyIdToken(token);
    const classDetails = await getClassDetailsByUID(decodedToken.uid);
    const { id } = request.body;

    const requiredFields = ["universityId", "facultyId", "departmentId", "classId"];
    const missing = requiredFields.filter(field => !classDetails[field]);
    if (missing.length || !id)
      return reply.code(400).send({ error: "Missing required fields", missing: !id ? ['id'] : missing });

    const duePath = `schools/${classDetails.universityId}/faculties/${classDetails.facultyId}/departments/${classDetails.departmentId}/classes/${classDetails.classId}/dues/${id}`;
    const dueRef = db.doc(duePath);

    const [dueDoc, recordsSnapshot] = await Promise.all([
      dueRef.get(),
      dueRef.collection("records").orderBy("paidOn").get()
    ]);

    if (!dueDoc.exists)
      return reply.code(404).send({ error: "Due not found" });

    const dueDetails = dueDoc.data().dueDetails;

    if (recordsSnapshot.empty)
      return reply.code(404).send({ success: false, message: "No records found for this due" });

    const members = recordsSnapshot.docs.map((doc, i) => {
      const data = doc.data();
      const settledAmount = parseFloat(data.amount - getUnCharge(data.amount));
      return {
        serial: i + 1,
        regno: doc.id || "N/A",
        name: data.studentName || "N/A",
        amount: settledAmount || 0,
        batch: data.dueBatch || "N/A",
        reciept: data.reciept ? "Reciept Confirmed" : "Pending Reciept",
        dateRegistered: data.paidOn?.toDate()?.toLocaleDateString("en-US") || "N/A"
      };
    });

    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
      font: "Helvetica",
      info: {
        Title: `Due Report for Due - ${dueDetails.id}`,
        Author: "Bine"
      }
    });

    
    const chunks = [];
    const stream = doc.pipe(new PassThrough());

    stream.on("data", chunk => chunks.push(chunk));
    stream.on("error", err => { throw err });

    // ✅ INSERT WATERMARK HERE
    const logoPath = path.resolve(__dirname, "../assets", "logo.png"); // ✅ Correct path
    await drawWatermark(doc, logoPath, "tiled"); // ✅ Now properly called

    

    // === PDF CONTENT ===
    doc.fillColor('#2c3e50').rect(0, 0, doc.page.width, 100).fill();
    doc.fillColor("white").fontSize(20).text("Due Report", 40, 20);
    doc.fontSize(12).text(`Due Name: ${dueDetails.name}`, 40, 50);

    doc.fillColor("white").fontSize(10)
      .text(`School: ${classDetails.universityName || 'N/A'}`, 250, 20, { align: 'right' })
      .text(`Faculty: ${classDetails.facultyName || 'N/A'}`, 250, 40, { align: 'right' })
      .text(`Department: ${classDetails.departmentName || 'N/A'}`, 250, 60, { align: 'right' })
      .text(`Generated on ${toCentralISOString(Date.now)}`, 300, 80, { align: 'right' });

    const tableTop = 120;
    doc.fillColor('#2c3e50').rect(25, tableTop, doc.page.width - 50, 20).fill();
    doc.fillColor('white').font('Helvetica-Bold').fontSize(7)
      .text("S/N", 40, tableTop + 5)
      .text("Reg No", 60, tableTop + 5)
      .text("Name", 120, tableTop + 5)
      .text("Amount (NGN)", 260, tableTop + 5)
      .text("Batch", 330, tableTop + 5)
      .text("Reciept", 380, tableTop + 5)
      .text("Paid on", 450, tableTop + 5)
      .text("Cumm. Amount", 520, tableTop + 5);

    doc.fillColor('black').font('Helvetica').fontSize(6);
    let y = tableTop + 25;
    let cum = 0;
    members.forEach((member, index) => {
      cum += member.amount;
      if (index % 2 === 0) {
        doc.fillColor('#f5f5f5').rect(25, y - 5, doc.page.width - 50, 17).fill();
      }

      doc.fillColor('black')
        .text(`${index + 1}`, 40, y)
        .text(member.regno, 60, y)
        .text(member.name, 120, y)
        .text((formatCurrency(member.amount)).slice(1), 280, y)
        .text(member.batch, 320, y)
        .text(member.reciept, 360, y)
        .text(toCentralISOString(member.dateRegistered), 440, y)
        .text((formatCurrency(cum)).slice(1), 520, y);
      y += 15;
    });

    doc.fontSize(10)
      .text(`Total Members: ${members.length}; Total Volume: NGN${cum}`, 40, doc.page.height - 40);

    doc.end();

    await new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    reply.type("application/pdf")
      .header("Content-Disposition", `attachment; filename=DueReport_${id}.pdf`)
      .send(Buffer.concat(chunks));

  } catch (error) {
    console.error("PDF Export Error:", error);
    reply.code(500).send({
      error: "Failed to generate PDF",
      details: error.message
    });
  }
};



export const exportListPdf = async function(request, reply) {
  try {
    const { getClassDetailsByUID, toCentralISOString } = await import('./utils.js');
    const { db, auth } = await import('./firebaseServices.js');
    const { PassThrough } = await import('stream');
    const PDFDocument = (await import('pdfkit')).default;

    // 1. Authentication
    const token = (request.headers.authorization || '').split("Bearer ")[1];
    if (!token) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    // 2. Authorization and Input
    const decodedToken = await auth.verifyIdToken(token);
    const classDetails = await getClassDetailsByUID(decodedToken.uid);
    const { id } = request.body;

    const requiredFields = ['universityId', 'facultyId', 'departmentId', 'classId'];
    const missing = requiredFields.filter(k => !classDetails[k]);
    if (!id || missing.length > 0) {
      return reply.code(400).send({ 
        error: "Missing required fields",
        missing: !id ? ['id'] : missing
      });
    }

    // 3. Fetch List Data
    const listPath = `schools/${classDetails.universityId}/faculties/${classDetails.facultyId}/departments/${classDetails.departmentId}/classes/${classDetails.classId}/lists/${id}`;
    const listRef = db.doc(listPath);

    const [listDoc, recordsSnapshot] = await Promise.all([
      listRef.get(),
      listRef.collection('records').orderBy('createdAt').get()
    ]);

    if (!listDoc.exists) {
      return reply.code(404).send({ error: "List not found" });
    }

    const listDetails = listDoc.data().listDetails || listDoc.data(); // fallback
    if (recordsSnapshot.empty) {
      return reply.code(404).send({ success: false, message: "No records found in this list" });
    }

    // 4. Prepare Members
    const members = recordsSnapshot.docs.map((doc, index) => {
      const data = doc.data();
      return {
        serial: index + 1,
        regno: doc.id || "N/A",
        name: data.name || "N/A",
        email: data.email || "N/A",
        phone: data.phone || "N/A",
        dateJoined: toCentralISOString(data.createdAt) || "N/A"
      };
    });
    // 3. Generate PDF with improved styling
    const doc = new PDFDocument({ 
    margin: 40, 
    size: 'A4',
    font: 'Helvetica',
    info: {
        Title: `Class Members - ${classDetails.classId}`,
        Author: 'School Management System'
    }
    });

    const chunks = [];
    const stream = doc.pipe(new PassThrough());

    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', (err) => {
    console.error('Stream error:', err);
    throw err;
    });

    // ✅ Draw watermark (call this early!)
    const logoPath = path.resolve(__dirname, "../assets", "logo.png"); // ✅ Correct path
    await drawWatermark(doc, logoPath, "tiled"); // ✅ Now properly called


    // ===== PDF Content ===== //

    // Header
    doc.fillColor('#2c3e50').rect(0, 0, doc.page.width, 100).fill();
    doc.fillColor('white').fontSize(20).text("List Report", 40, 20);
    doc.fontSize(12).text(`List Name: ${listDetails.name || id}`, 40, 50);

    doc.fillColor('white').fontSize(10)
      .text(`School: ${classDetails.universityName || 'N/A'}`, 250, 20, { align: 'right' })
      .text(`Faculty: ${classDetails.facultyName || 'N/A'}`, 250, 40, { align: 'right' })
      .text(`Department: ${classDetails.departmentName || 'N/A'}`, 250, 60, { align: 'right' })
      .text(`Generated on: ${toCentralISOString(Date.now())}`, 300, 80, { align: 'right' });

    doc.moveDown(2);
    const tableTop = 120;

    // Table Header
    doc.fillColor('#2c3e50')
      .rect(25, tableTop, doc.page.width - 50, 20)
      .fill();

    doc.fillColor('white')
      .font('Helvetica-Bold')
      .fontSize(7)
      .text("S/N", 40, tableTop + 5)
      .text("Reg No", 60, tableTop + 5)
      .text("Name", 120, tableTop + 5)
      .text("Email", 250, tableTop + 5)
      .text("Phone", 360, tableTop + 5)
      .text("Joined On", 440, tableTop + 5);

    // Table Rows
    doc.fillColor('black').font('Helvetica').fontSize(6);

    let y = tableTop + 25;
    members.forEach((member, index) => {
      if (index % 2 === 0) {
        doc.fillColor('#f5f5f5').rect(25, y - 5, doc.page.width - 50, 17).fill();
      }

      doc.fillColor('black')
        .text(member.serial, 40, y)
        .text(member.regno, 60, y)
        .text(member.name, 120, y)
        .text(member.email, 250, y)
        .text(member.phone, 360, y)
        .text(toCentralISOString(member.dateJoined), 440, y);

      y += 15;
    });

    // Footer Summary
    doc.fontSize(10).text(`Total Students in List: ${members.length}`, 40, doc.page.height - 40);

    // ===== End Content ===== //

    doc.end();

    // Finalize
    await new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    reply.type('application/pdf')
      .header('Content-Disposition', `attachment; filename=List_Report_${id}.pdf`)
      .send(Buffer.concat(chunks));

  } catch (error) {
    console.error("PDF Export Error:", error);
    reply.code(500).send({
      error: "Failed to generate PDF",
      details: error.message
    });
  }
}
