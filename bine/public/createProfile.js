import { notice, runWindow, showLoad } from "./utility.js";

function createProfile(){
    const fname = document.getElementById("fname").value;
    const onames = document.getElementById("onames").value;
    const email = document.getElementById("email").value;
    const phone = document.getElementById("phone").value;
    const regno = document.getElementById("regno").value;
    const universityId = document.getElementById("university").value;
    const facultyId = document.getElementById("faculty").value; 
    const departmentId = document.getElementById("department").value;
    const classId = document.getElementById("curClass").value;

    if (!universityId) {
        notice("No University Selected! Kindly select your University.", "info");
        return;
    }
    if (!facultyId) {
        notice("No Faculty Selected! Kindly select your Faculty.", "info");
        return;
    }
    if (!departmentId) {
        notice("No Department Selected! Kindly select your Department.", "info");
        return;
    }
    if (!classId) {
        notice("Kindly select your Class.", "info");
        return;
    }
    if (!regno) {
        notice("Please, Input your University Registration / Matriculation Number.", "info");
        return;
    }
    if (!phone) {
        notice("Kindly input your Phone Number!", "info");
        return;
    }
    if (!email) {
        notice("Kindly input your E-mail!", "info");
        return;
    }
    if (!onames) {
        notice("Input your other names!", "info");
        return;
    }
    if (!fname) {
        notice("Input your first name", "info");
        return;
    }
    else{
        showLoad("show", "createProfile-button");
        const payload = {fname, onames, email, phone, regno, universityId, facultyId, departmentId, classId};
        fetch('/api/createProfile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({payload})
          })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                notice(data.message, "success");
                document.getElementById("createProfile-button").innerHTML = `Create Profile`;
                setTimeout(() => {
                    window.location.href= "portal.html";
                }, 5000);
                showLoad("hide", "createProfile-button");
              } else {
                notice(data.message, "error");  // Show any error message from the API
                document.getElementById("createProfile-button").innerHTML = `Create Profile`;
                document.getElementById("createProfile-button").disabled = false;
                showLoad("hide", "createProfile-button");
              }
            })
            .catch(error => {
              console.error('Error:', error);
              notice('An error occurred during profile creation.', "error");
              showLoad("hide", "createProfile-button");
            });
        }
    }

/**
 * Fetches, i.e populates the options.. 
 * @param {string} section - Either 'universities', 'faculties' or 'departments', it's simply what to fetch
 * @param {string} setElementId - ID of input selection element to update
 * @returns 
 */
async function updateOptions(setElementId, section) {
  const sectionElement = document.getElementById(setElementId);
  sectionElement.innerHTML = `<option value=''>Loading ${section}...</option>`;
  const payload = {section};
  payload.universityId = document.getElementById("university").value;
  payload.facultyId = document.getElementById("faculty")?.value || "";
  payload.departmentId = document.getElementById("department")?.value || "";
  await fetch("/api/getSection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload)
    })
    .then(async res => {
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Fetch failed");
      }
      return res.json();
    })
    .then(data => {
      sectionElement.innerHTML = "<option value=''>Select...</option>";
      sectionElement.disabled = false;
      if (!data.subSections?.length) {
          sectionElement.innerHTML = section == "faculties" ? "<option value=''> --No faculty found!-- </option>" : "<option value=''> --No department found!-- </option>";
        notice(`No ${section} found under selected parent.`, "info");
        return;
      }
      data.subSections.forEach(sub => {
          const option = document.createElement("option");
          option.value = section == "faculties"  ? sub.facultyId : section == "departments" ? sub.departmentId : section == "classes" ? sub.classId : sub.Id;
          option.textContent = section == "faculties"  ? sub.facultyName : section == "departments" ? sub.departmentName : section == "classes" ? sub.className : sub.name;
          sectionElement.appendChild(option);
        });
    })
    .catch(err => {
      console.error(err);
      notice(`Error fetching ${section}: ${err.message}`, "error");
    });
}


document.addEventListener("DOMContentLoaded",async function () {
    await updateOptions('university', 'universities');
    console.log("DOM fully loaded and parsed!");
  });  
  
document.getElementById("regno").addEventListener('change', function(){
    updateOptions('university', 'universities');
});

window.updateOptions = updateOptions;
window.createProfile = createProfile;
//window.assignLength = assignLength;
//window.getProfile = getProfile;