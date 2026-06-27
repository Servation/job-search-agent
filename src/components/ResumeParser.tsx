/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FileText, ArrowRight, Sparkles, Check, Edit2, Upload, Layers } from 'lucide-react';
import { ResumeProfile, LLMConfig } from '../types';

interface ResumeParserProps {
  profile: ResumeProfile;
  onChangeProfile: (profile: ResumeProfile) => void;
  onParseComplete: (parsed: { name?: string; skills?: string[]; roles?: string[]; location?: string; yearsOfExperience?: number }) => void;
  addAiLog: (msg: string) => void;
  llmConfig: LLMConfig;
}

export default function ResumeParser({ profile, onChangeProfile, onParseComplete, addAiLog, llmConfig }: ResumeParserProps) {
  const [resumeText, setResumeText] = useState(profile.rawText);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState(false);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setParseError(null);
    setIsParsing(true);
    addAiLog(`Selected "${file.name}".`);

    if (file.type === "application/pdf") {
      addAiLog(`Reading your PDF resume (using ${llmConfig.modelName})...`);
      const reader = new FileReader();
      reader.onload = async (event) => {
        const urlPart = event.target?.result as string;
        if (urlPart) {
          try {
            const base64Data = urlPart.split(',')[1];
            
            // Server call
            const response = await fetch('/api/resume/parse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileBase64: base64Data, mimeType: 'application/pdf', llmConfig }),
            });

            if (!response.ok) {
              const errMsg = await response.text();
              throw new Error(errMsg || "Could not read the PDF.");
            }

            const data = await response.json();
            
            const extractedText = data.extractedRawText || "";
            setResumeText(extractedText);
            
            addAiLog(`Read your PDF (Name: "${data.parsedName || "Not found"}"). Found ${data.parsedSkills?.length || 0} skills.`);

            onParseComplete({
              name: data.parsedName,
              skills: data.parsedSkills,
              roles: data.targetRoles,
              location: data.preferredLocation,
              yearsOfExperience: data.yearsOfExperience,
            });

            onChangeProfile({
              ...profile,
              rawText: extractedText,
              parsedName: data.parsedName || "Applicant Profile",
              parsedSkills: data.parsedSkills || [],
              targetRoles: data.targetRoles || [],
              preferredLocation: data.preferredLocation || 'Remote',
              yearsOfExperience: data.yearsOfExperience ?? profile.yearsOfExperience,
            });

            setSuccessMsg(true);
            setTimeout(() => setSuccessMsg(false), 4500);
          } catch (err: any) {
            console.warn("PDF Server parsing error.", err);
            addAiLog(`Couldn't read the PDF (${err.message || "Unknown error"}). Your saved resume was kept.`);
            // IMPORTANT: do NOT overwrite the saved profile on a failed PDF parse.
            // Previously this ran the local fallback parser on a placeholder string,
            // which wiped a good resume/skills/roles when a parse merely timed out.
            // A PDF gives us no real text to fall back on, so preserve the existing
            // profile and ask the user to paste the text instead.
            setParseError(`Could not read the PDF: ${err.message || 'Error'}. Your saved resume was not changed. Make sure your local LLM server is running, then paste your resume text below and click "Parse Resume".`);
          } finally {
            setIsParsing(false);
          }
        }
      };
      reader.onerror = () => {
        addAiLog("Could not open the file.");
        setParseError("Could not read the PDF file.");
        setIsParsing(false);
      };
      reader.readAsDataURL(file);
    } else {
      // Standard plain text file
      addAiLog("Reading your resume file...");
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        if (text) {
          setResumeText(text);
          addAiLog("Sending your resume to be read...");
          try {
            const response = await fetch('/api/resume/parse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rawText: text, llmConfig }),
            });

            if (!response.ok) {
              throw new Error("Failed server parse");
            }

            const data = await response.json();
            addAiLog(`Read your resume. Name: "${data.parsedName || "Not found"}".`);
            onParseComplete({
              name: data.parsedName,
              skills: data.parsedSkills,
              roles: data.targetRoles,
              location: data.preferredLocation,
              yearsOfExperience: data.yearsOfExperience,
            });

            onChangeProfile({
              ...profile,
              rawText: text,
              parsedName: data.parsedName || "Applicant Profile",
              parsedSkills: data.parsedSkills || [],
              targetRoles: data.targetRoles || [],
              preferredLocation: data.preferredLocation || 'Remote',
              yearsOfExperience: data.yearsOfExperience ?? profile.yearsOfExperience,
            });

            setSuccessMsg(true);
            setTimeout(() => setSuccessMsg(false), 4500);
          } catch (err) {
            console.warn("Server text file parse error. Falling back to local keyword heuristics.");
            addAiLog("Couldn't reach the server. Scanning your resume for keywords instead...");
            fallbackParser(text);
          } finally {
            setIsParsing(false);
          }
        } else {
          setIsParsing(false);
        }
      };
      reader.onerror = () => {
        addAiLog("Could not read the file.");
        setParseError("Could not read the file.");
        setIsParsing(false);
      };
      reader.readAsText(file);
    }
  };

  // Suggested sample resume for testing
  const loadSampleResume = () => {
    const sample = `Alex Mercer
alex.mercer@email.dev | (555) 019-2831 | New York, NY (Hybrid/Remote)
GitHub: github.com/alex-dev | Portfolio: alexmercer.dev

SUMMARY
Versatile Software Engineer with 5+ years of experience crafting elite, reactive single-page applications. Deep mastery in React, TypeScript, and client-side performance engineering. Passionate about beautiful UX, typographic rhythm, and performance metrics.

CORE SKILLS
• Languages: TypeScript, JavaScript (ESNext), Python, HTML5/CSS3
• Frameworks/Libraries: React 18, Next.js, Framer Motion, TailWind CSS, Node.js, Express, Recharts, D3.js
• Tools: Vite, ESBuild, Git, Docker, AWS (S3, CloudRun/ECS), CI/CD, Jest

EXPERIENCE
Senior Frontend Engineer | Linear Technologies (2023 - Present)
• Formulated a performance-critical collaborative tracking interface that boosted user session duration by 35%.
• Architected dynamic dashboard components using Recharts reducing payload delivery by 40%.
• Mentored 4 junior engineers on React state design, resolving infinite re-render loops and minimizing DOM weight.

Full-Stack Developer | Stripe Systems Contract (2021 - 2023)
• Developed responsive checkout portals supporting dynamic W2 and contract developer roles.
• Embedded structured duplicate verification caches preventing triple-tap event anomalies during payment routines.
• Maintained automated testing dashboards achieving 92% test coverage.

EDUCATION
B.S. in Computer Science | New York University (2017 - 2021)`;
    setResumeText(sample);
  };

  const handleParse = async () => {
    if (!resumeText.trim()) {
      setParseError("Please paste your resume first.");
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setSuccessMsg(false);
    addAiLog("Reading your resume...");

    try {
      // Call the express parser route
      const response = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: resumeText, llmConfig }),
      });

      if (!response.ok) {
        throw new Error(await response.text() || "Could not read your resume.");
      }

      const data = await response.json();
      addAiLog(`Read your resume. Name: "${data.parsedName || "You"}", Skills: ${data.parsedSkills?.length || 0}.`);
      
      onParseComplete({
        name: data.parsedName,
        skills: data.parsedSkills,
        roles: data.targetRoles,
        location: data.preferredLocation,
        yearsOfExperience: data.yearsOfExperience,
      });

      onChangeProfile({
        ...profile,
        rawText: resumeText,
        parsedName: data.parsedName || "Applicant Profile",
        parsedSkills: data.parsedSkills || [],
        targetRoles: data.targetRoles || [],
        preferredLocation: data.preferredLocation || 'Remote',
        yearsOfExperience: data.yearsOfExperience ?? profile.yearsOfExperience,
      });

      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 4000);
    } catch (err: any) {
      console.warn("Server parsing error. Using local fallback parser.", err);
      addAiLog("Couldn't reach the server. Scanning your resume for keywords instead...");
      // Fallback local key-word heuristic matching if server-side Gemini key is absent
      fallbackParser(resumeText);
    } finally {
      setIsParsing(false);
    }
  };

  const fallbackParser = (text: string) => {
    // Basic heuristic to avoid breaking if user hasn't input the Gemini API Key
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const name = lines[0]?.length < 50 ? lines[0] : "Applicant Profile";
    
    // Simple regex matching for common skills
    const popularSkills = [
      "React", "TypeScript", "JavaScript", "Python", "Tailwind CSS", "Next.js", "Node.js", "Express", 
      "D3", "AWS", "Git", "Docker", "Framer Motion", "Recharts", "SQL", "PostgreSQL", "C++", "Java",
      "HIPAA", "Epic EMR", "HL7", "Product Management"
    ];
    const foundSkills = popularSkills.filter(s => text.toLowerCase().includes(s.toLowerCase()));

    // Dynamic heuristic for roles
    const rolesSet = new Set<string>();
    const commonRoles = [
      "Software Engineer", "Frontend Architect", "AI Integrations", "Full Stack", "Data Analyst",
      "Product Manager", "Systems Architect", "Health IT Analyst", "DevOps", "Developer", "Designer", "Contractor"
    ];
    
    // Scan text lines for any lines that look like roles
    lines.forEach(line => {
      commonRoles.forEach(r => {
        if (line.toLowerCase().includes(r.toLowerCase()) && line.length < 60) {
          rolesSet.add(line);
        }
      });
    });

    const targetRoles = rolesSet.size > 0 ? Array.from(rolesSet).slice(0, 4) : [];

    addAiLog(`Found name "${name}". Matched skills: [${foundSkills.join(", ")}].`);

    onParseComplete({
      name,
      skills: foundSkills,
      roles: targetRoles,
      location: "Remote",
      yearsOfExperience: 0,
    });

    onChangeProfile({
      ...profile,
      rawText: text,
      parsedName: name,
      parsedSkills: foundSkills,
      targetRoles: targetRoles,
      preferredLocation: "Remote",
      yearsOfExperience: profile.yearsOfExperience,
    });

    setSuccessMsg(true);
    setTimeout(() => setSuccessMsg(false), 4000);
  };

  return (
    <section className="bg-surface border-2 border-outline-variant p-6 sm:p-8 neo-shadow relative" id="resume-parser-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4 border-b-2 border-outline-variant pb-4">
        <div>
          <h2 className="text-2xl font-headline font-bold text-primary flex items-center gap-3 uppercase tracking-widest">
            <div className="p-2 bg-primary text-on-primary border-2 border-black neo-shadow-primary">
              <FileText className="w-6 h-6" />
            </div>
            Resume Profile
          </h2>
          <p className="text-sm text-on-surface-variant mt-3 font-body">
            Paste your resume below. The agent uses it to find matching jobs.
          </p>
        </div>
      </div>

      <div className="space-y-8 font-body">
        {/* 🚀 Drag and drop document file upload */}
        <div 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`relative p-8 border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
            dragActive 
              ? 'border-primary bg-primary-container scale-[1.02]' 
              : 'border-outline-variant bg-surface-container hover:bg-surface-container-high hover:border-primary'
          }`}
          onClick={() => document.getElementById('resume-file-input')?.click()}
        >
          <input 
            type="file"
            id="resume-file-input"
            className="hidden"
            accept=".pdf,.txt,.md"
            onChange={handleFileInputChange}
          />
          <Upload className={`w-10 h-10 ${dragActive ? 'text-primary animate-bounce' : 'text-on-surface-variant'} mb-4`} />
          <h4 className="text-sm font-headline font-bold uppercase tracking-widest text-on-surface">
            Upload Your Resume (PDF, TXT, MD)
          </h4>
          <p className="text-xs text-on-surface-variant mt-2 max-w-xs leading-normal">
            Drag and drop your resume here, or click to choose a file.
          </p>
        </div>

        <div>
          <label className="block text-sm font-headline font-bold uppercase tracking-widest text-on-surface mb-3 flex items-center justify-between">
            <span>Your Resume</span>
          </label>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your full resume or experience history here..."
            className="w-full h-56 px-4 py-4 border-2 border-outline-variant bg-surface-container-lowest text-on-surface text-sm focus:outline-none focus:border-primary focus:ring-0 transition-all placeholder:text-outline font-mono leading-relaxed resize-y"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-surface-container border-2 border-outline-variant">
          <div className="text-sm font-headline uppercase font-bold tracking-wider">
            {profile.parsedName ? (
              <span className="flex items-center gap-2 text-primary">
                <Check className="w-5 h-5" /> Saved: {profile.parsedName}
              </span>
            ) : (
              <span className="text-outline-variant">Not parsed yet</span>
            )}
          </div>
          
          <button
            onClick={handleParse}
            disabled={isParsing || !resumeText.trim()}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary font-headline font-extrabold uppercase tracking-widest hover:opacity-90 active:scale-[0.98] focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed transition-all border-2 border-black neo-shadow-primary cursor-pointer"
          >
            {isParsing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-on-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Parsing...
              </span>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Parse Resume
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>

        {parseError && (
          <div className="p-4 bg-error-container text-sm text-on-error-container border-2 border-error leading-relaxed font-mono font-bold uppercase tracking-wider">
            {parseError}
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-primary-container text-sm text-on-primary-container border-2 border-primary flex items-center gap-3 font-headline font-bold uppercase tracking-wider">
            <Check className="w-6 h-6 text-primary" /> Resume parsed. Your details are below.
          </div>
        )}

        {profile.parsedSkills && profile.parsedSkills.length > 0 && (
          <div className="pt-6 border-t-2 border-outline-variant transition-all">
            <div className="flex items-center justify-between mb-6">
              <span className="text-lg font-headline font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Parsed Details
              </span>
              <button
                onClick={() => setIsEditingTags(!isEditingTags)}
                className="px-4 py-2 text-xs font-headline font-bold uppercase tracking-widest border-2 border-outline-variant hover:border-primary hover:text-primary transition-all flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" /> {isEditingTags ? "Close Edit" : "Edit Details"}
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-5 bg-surface-container border-2 border-outline-variant">
                <span className="text-sm font-headline font-bold uppercase tracking-widest text-on-surface block mb-3">Target Roles</span>
                {isEditingTags ? (
                  <input
                    type="text"
                    value={profile.targetRoles?.join(', ')}
                    onChange={(e) => onChangeProfile({
                      ...profile,
                      targetRoles: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    })}
                    className="w-full px-4 py-3 text-sm bg-surface-container-lowest border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary font-mono placeholder:text-outline"
                    placeholder="Software Engineer, Frontend Developer"
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {profile.targetRoles?.map((role, idx) => (
                      <span key={idx} className="px-3 py-1.5 bg-surface border-2 border-outline-variant text-xs font-headline font-bold uppercase tracking-wider text-on-surface">
                        {role}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-5 bg-surface-container border-2 border-outline-variant">
                <span className="text-sm font-headline font-bold uppercase tracking-widest text-on-surface block mb-3">Skills</span>
                {isEditingTags ? (
                  <input
                    type="text"
                    value={profile.parsedSkills?.join(', ')}
                    onChange={(e) => onChangeProfile({
                      ...profile,
                      parsedSkills: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    })}
                    className="w-full px-4 py-3 text-sm bg-surface-container-lowest border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary font-mono placeholder:text-outline"
                    placeholder="React, AWS, CSS"
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {profile.parsedSkills?.map((skill, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-surface-container-high border-2 border-outline-variant text-xs font-mono font-bold text-primary">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-5 bg-surface-container border-2 border-outline-variant">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-headline font-bold uppercase tracking-widest text-on-surface block">Minimum Match Score</span>
                  <span className="text-lg font-headline font-extrabold text-primary border-b-2 border-primary px-2">{profile.minMatchScore}%</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="90"
                  value={profile.minMatchScore}
                  onChange={(e) => onChangeProfile({ ...profile, minMatchScore: Number(e.target.value) })}
                  className="w-full h-2 bg-outline-variant appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
