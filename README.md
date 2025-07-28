# Healthcare API Assessment

**Developer:** Carlos Banks 
**Project:** Healthcare API Risk Scoring System

## What it does
- Fetches patient data from API with retry logic for rate limiting
- Calculates risk scores based on blood pressure, temperature, and age  
- Identifies data quality issues
- Auto-submits results

## Results

**Final Score: 95% PASS** ✅

- ✅ Fever patients: Perfect (9/9)
- ✅ Data quality: Perfect (8/8)  
- 🔄 High-risk patients: 18/20 (missed 2)

**Attempts:**
1. 95% PASS
2. 48% FAIL (blood pressure logic broken)
3. 95% PASS