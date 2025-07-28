const API_KEY = 'ak_a1f405bbd50cab144d09b071a4bfb43cd63026dc8ae7f450';
const BASE_URL = 'https://assessment.ksensetech.com/api';
const LIMIT = 5;

function fetchPatients(page = 1, retries = 5) {
  const delay = Math.min(2000 * Math.pow(1.5, 5 - retries), 10000);
  
  return fetch(`${BASE_URL}/patients?page=${page}&limit=${LIMIT}`, {
    headers: {
      'x-api-key': API_KEY,
    },
  })
    .then((res) => {
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          if (retries > 0) {
            console.warn(`Retrying page ${page} in ${delay}ms... (${retries} retries left)`);
            return new Promise((resolve) =>
              setTimeout(() => resolve(fetchPatients(page, retries - 1)), delay)
            );
          } else {
            throw new Error(`Max retries exceeded for page ${page}`);
          }
        } else {
          throw new Error(`HTTP error ${res.status}`);
        }
      }
      return res.json();
    });
}

async function getAllPatients() {
  let page = 1;
  let allPatients = [];
  let hasNext = true;

  while (hasNext) {
    try {
      console.log(`Fetching page ${page}...`);
      const data = await fetchPatients(page);
      const patients = data.data || [];

      allPatients = allPatients.concat(patients);
      hasNext = data.pagination?.hasNext;
      page++;
      
      // Add delay between successful requests to avoid rate limiting
      if (hasNext) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error(`Failed to get page ${page}:`, err.message);
      break;
    }
  }

  return allPatients;
}

function parseBloodPressure(bp) {
  if (!bp || typeof bp !== 'string') return { systolic: null, diastolic: null };
  
  const parts = bp.split('/');
  if (parts.length !== 2) return { systolic: null, diastolic: null };
  
  const systolic = parseInt(parts[0]);
  const diastolic = parseInt(parts[1]);
  
  return {
    systolic: isNaN(systolic) ? null : systolic,
    diastolic: isNaN(diastolic) ? null : diastolic
  };
}

function calculateBloodPressureRisk(bp) {
  const { systolic, diastolic } = parseBloodPressure(bp);
  
  if (systolic === null || diastolic === null) return 0;
  
  // Check for Normal: Systolic <120 AND Diastolic <80
  if (systolic < 120 && diastolic < 80) return 0;
  
  // Check for Elevated: Systolic 120-129 AND Diastolic <80
  if (systolic >= 120 && systolic <= 129 && diastolic < 80) return 1;
  
  // Check for Stage 1: Systolic 130-139 OR Diastolic 80-89
  if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) return 2;
  
  // Check for Stage 2: Systolic ≥140 OR Diastolic ≥90
  if (systolic >= 140 || diastolic >= 90) return 3;
  
  return 0;
}

function calculateTemperatureRisk(temp) {
  if (temp === null || temp === undefined || typeof temp !== 'number') return 0;
  
  if (temp <= 99.5) return 0; // Normal
  else if (temp >= 99.6 && temp <= 100.9) return 1; // Low fever
  else if (temp >= 101.0) return 2; // High fever
  
  return 0;
}

function calculateAgeRisk(age) {
  if (age === null || age === undefined || typeof age !== 'number') return 0;
  
  if (age < 40) return 0; // Under 40: 0 points (not 10!)
  else if (age >= 40 && age <= 65) return 1; // 40-65: 1 point
  else if (age > 65) return 2; // Over 65: 2 points
  
  return 0;
}

function hasDataQualityIssues(patient) {
  const { systolic, diastolic } = parseBloodPressure(patient.blood_pressure);
  const hasInvalidBP = systolic === null || diastolic === null;
  const hasInvalidTemp = patient.temperature === null || patient.temperature === undefined || typeof patient.temperature !== 'number';
  const hasInvalidAge = patient.age === null || patient.age === undefined || typeof patient.age !== 'number';
  
  return hasInvalidBP || hasInvalidTemp || hasInvalidAge;
}

function processPatients(patients) {
  const highRiskPatients = [];
  const feverPatients = [];
  const dataQualityIssues = [];
  
  console.log(`Processing ${patients.length} patients...`);
  
  patients.forEach(patient => {
    console.log(`Processing patient ${patient.patient_id}:`, patient);
    
    // Check for data quality issues first
    if (hasDataQualityIssues(patient)) {
      dataQualityIssues.push(patient.patient_id);
      console.log(`  Data quality issue detected`);
    }
    
    // Calculate risk scores
    const bpRisk = calculateBloodPressureRisk(patient.blood_pressure);
    const tempRisk = calculateTemperatureRisk(patient.temperature);
    const ageRisk = calculateAgeRisk(patient.age);
    const totalRisk = bpRisk + tempRisk + ageRisk;
    
    console.log(`BP Risk: ${bpRisk}, Temp Risk: ${tempRisk}, Age Risk: ${ageRisk}, Total: ${totalRisk}`);
    
    // Check high risk (total >= 4)
    if (totalRisk >= 4) {
      highRiskPatients.push(patient.patient_id);
      console.log(`High risk patient identified`);
    }
    
    // Check fever (temp >= 99.6)
    if (typeof patient.temperature === 'number' && patient.temperature >= 99.6) {
      feverPatients.push(patient.patient_id);
      console.log(`Fever patient identified`);
    }
  });
  
  return {
    high_risk_patients: highRiskPatients,
    fever_patients: feverPatients,
    data_quality_issues: dataQualityIssues
  };
}

async function submitAssessment(results) {
  try {
    console.log('Submitting assessment results...');
    console.log('Submitting:', results);
    
    const response = await fetch(`${BASE_URL}/submit-assessment`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(results),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();
    
    console.log('Full API Response:', data);
    console.log('Assessment submitted successfully!');
    
    if (data.results?.feedback) {
      console.log('Strengths:', data.results.feedback.strengths);
      console.log('Issues to fix:', data.results.feedback.issues);
    }
    
    return data;
  } catch (err) {
    console.error('Failed to submit assessment:', err.message);
    throw err;
  }
}

async function run() {
  try {
    console.log('Starting patient data collection...');
    const patients = await getAllPatients();
    console.log(`Collected ${patients.length} patients`);
    
    if (patients.length === 0) {
      console.error('No patients retrieved!');
      document.getElementById('output').textContent = 'Error: No patients retrieved';
      return;
    }
    
    console.log('Processing patients for risk assessment...');
    const results = processPatients(patients);
    
    console.log('Risk Assessment Results:', results);
    console.log('High Risk Count:', results.high_risk_patients.length);
    console.log('Fever Count:', results.fever_patients.length); 
    console.log('Data Quality Issues Count:', results.data_quality_issues.length);
    
    document.getElementById('output').textContent = JSON.stringify(results, null, 2);
    
    console.log('AUTO-SUBMITTING RESULTS...');
    await submitAssessment(results);
    
  } catch (err) {
    console.error('Error in run():', err.message);
    document.getElementById('output').textContent = `Error: ${err.message}`;
  }
}

run();