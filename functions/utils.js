import * as logger from "firebase-functions/logger";
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function toBase62(num) {
    if (num === 0) return '0';
    let result = '';
    while (num > 0) {
        result = BASE62[num % 62] + result;
        num = Math.floor(num / 62);
    }
    return result;
}


const logPrefix = () => `[${new Date().toISOString()}]`;
export const log = (...args) => {
    console.log(logPrefix(), ...args);
};
export const info = (...args) => {
    console.info(logPrefix(), ...args);
};
export const warn = (...args) => {
    console.warn(logPrefix(), ...args);
};
export const error = (...args) => {
    console.error(logPrefix(), ...args);
};



/**
 * Generates transaction ID for a new transaction
 * @param {string} regno - redistration number of student who initiated transaction 
 * @param {number} timestamp - time of transaction initiation 
 * @returns {string}
 */
export function newTransaction(regno) {
    const numericRegno = regno.replace(/\D/g, '');
    const regnoPart = numericRegno.slice(-5);
    const timePart = toBase62(parseInt(Date.now()));
    return `${regnoPart}${timePart}`;
}

/**
 * Fetches the class details of the the class whose administrator UID is provided
 * @param {string} uid - UID of class admin
 * @returns {object}
 */
export async function getClassDetailsByUID(uid) {
    try {
    const { db } = await import ('./firebaseServices.js');
    const userDoc = await db.collection("course-reps").doc(uid).get();
    const data = userDoc.data();
    const cp = data.class;
    const personal = data.personal;
    return {
        universityId: cp.universityId,
        facultyId: cp.facultyId,
        departmentId: cp.departmentId,
        classId: cp.classId,
        className: cp.className,
        departmentName: cp.departmentName,
        universityName: cp.universityName,
        facultyName: cp.facultyName,
        cpregno: personal.regno,
        profileVerified: personal.profileVerified
    };
    }catch(err){
        logger.warn("Error getting class by UID", err);
        return false;
    }
}

/**
 * Fetches the class details of the the class of the student whose regno is provided
 * @param {string} regno - regno of student
 * @param {string} universityId - The universityId of the student
 * @returns {object}
 */
export async function getClassDetailsByregno(regno, universityId) {
    const { db } = await import ('./firebaseServices.js');
    const Joi = (await import('joi')).default;

    try {
        const schema = Joi.object({
            universityId: Joi.string().required(),
            regno: Joi.string().required()
        });

        const { error } = schema.validate({universityId, regno});
        if (error) {
            return { 
                success: false, 
                message: error.details[0].message 
            }
        }

        const profileRef = db.collection("schools")
                                .doc(universityId)
                                .collection("studentProfiles")
                                .doc(regno);
        const profileSnap = await profileRef.get();

        if (profileSnap.exists) {
            const profileDetails = profileSnap.data();
            return { 
                success: true,
                details: {
                    regno,
                    name: profileDetails.name,
                    departmentName: profileDetails.departmentName,
                    classId: profileDetails.classId,
                    universityId: profileDetails.universityId,
                    facultyId: profileDetails.facultyId,
                    departmentId: profileDetails.departmentId,
                    profileVerified: profileDetails.profileVerified
                }
            }
        } else {
            return { 
                success: false,
                message: "Profile not found!"
            }
        }

    } catch (error) {
        console.error("Profile search error:", error);
        return reply.code(500).send({
            success: false,
            message: "Internal server error retrieving profile"
        });
    }
}

export function getCharge(amount) {
    const numericAmount = parseFloat(amount); 
    if (isNaN(numericAmount) || numericAmount < 0) {
        console.error("Invalid or negative amount provided for charge calculation.");
        return 0.00;
    }
    const rate = 1.2;
    const chargePercentage = numericAmount * (rate / 100);
    const cappedCharge = Math.min(chargePercentage, 250);
    const finalCharge = Math.round(cappedCharge * 100) / 100;

    console.log(`Charge of ${numericAmount} is ${finalCharge.toFixed(2)}`); // Log formatted
    return finalCharge; // Return as a number
}


export function getUnCharge(amount) {
    const numericAmount = parseFloat(amount); 
    if (isNaN(numericAmount) || numericAmount < 0) {
        console.error("Invalid or negative amount provided for charge calculation.");
        return 0.00;
    }
    const rate = 0.0118577075; // |(1.2/100)^2 - (1.2/100)|
    const chargePercentage  = numericAmount * rate;
    const finalCharge = parseFloat((chargePercentage).toFixed(2));

    console.log(`UnCharging of ${numericAmount} is ${finalCharge}`); // Log formatted
    return finalCharge; // Return as a number
}

export function formatCurrency(amount) {
    return parseFloat(amount).toLocaleString('en-NG', { 
        style: 'currency', 
        currency: 'NGN',
        minimumFractionDigits: 2
    });
}

// Cache the formatter for better performance
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Africa/Lagos',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

export function toCentralISOString(value, fallbackToNow = false) {
  try {
    let date;

    // Handle null/undefined
    if (value == null) {
      return fallbackToNow ? toCentralISOString(new Date()) : null;
    }

    // Firestore Timestamp (both v8 and v9 formats)
    if (typeof value === 'object' && !(value instanceof Date)) {
      if ('toDate' in value) {
        date = value.toDate(); // Firestore v9
      } else if ('_seconds' in value) {
        date = new Date(value._seconds * 1000); // Firestore v8 (ignore nanoseconds)
      }
    }
    // JavaScript Date object
    else if (value instanceof Date) {
      date = new Date(value); // Clone to avoid mutation
    }
    // Number (timestamp)
    else if (typeof value === 'number') {
      date = new Date(value > 9999999999 ? value : value * 1000); // Handle seconds or ms
    }
    // String
    else if (typeof value === 'string') {
      // Try ISO format first, then fallback to JS Date parsing
      date = isNaN(Date.parse(value)) ? new Date(value.replace(/-/g, '/')) : new Date(value);
    }

    // Validate date
    if (!date || isNaN(date.getTime())) {
      return fallbackToNow ? toCentralISOString(new Date()) : null;
    }

    // Format parts
    const parts = formatter.formatToParts(date);
    const partMap = {};
    parts.forEach(part => partMap[part.type] = part.value);

    // Pad single-digit values (though formatter should handle this)
    const pad = (val) => val.toString().padStart(2, '0');

    return `${partMap.year}-${pad(partMap.month)}-${pad(partMap.day)}, ${pad(partMap.hour)}:${pad(partMap.minute)}:${pad(partMap.second)}`;
    
  } catch (err) {
    console.error('Date conversion error:', err);
    return fallbackToNow ? toCentralISOString(new Date()) : null;
  }
}
