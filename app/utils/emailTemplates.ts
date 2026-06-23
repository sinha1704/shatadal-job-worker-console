/**
 * Generates a complete, professional HTML outreach email for recruiters.
 * Contains the FULL CV: all work experience, all projects, all skill categories, education.
 * Uses inline CSS for maximum email client compatibility.
 */
export function getGraphicOutreachTemplate(customMessage: string): string {
  const formattedMessage = customMessage.replace(/\n/g, '<br />');

  // ─── Reusable style helpers ───────────────────────────────────────────────
  const tag = (text: string, color = '#e2e8f0') =>
    `<span style="font-size:11px;font-weight:700;background-color:#0f172a;color:${color};padding:3px 9px;border-radius:5px;border:1px solid #334155;display:inline-block;margin:2px 2px 0 0;">${text}</span>`;

  const sectionTitle = (icon: string, text: string) => `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:14px;">
      <tr>
        <td style="font-size:14px;font-weight:800;color:#ffffff;text-transform:uppercase;letter-spacing:0.07em;padding-bottom:4px;border-bottom:2px solid #4f46e5;">
          ${icon}&nbsp;&nbsp;${text}
        </td>
      </tr>
    </table>`;

  const divider = `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:22px 0 22px 0;">
      <tr><td style="border-bottom:1px solid #1e293b;"></td></tr>
    </table>`;

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <title>Shatadal Sundar Sinha — Senior Front-End Developer</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style type="text/css">
    body { margin:0; padding:0; width:100% !important; background-color:#020617;
           font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
           -webkit-font-smoothing:antialiased; }
    img  { border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    table { border-collapse:collapse !important; }
    a { color:#818cf8; text-decoration:none; }
    a:hover { text-decoration:underline; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#020617;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#020617;padding:24px 0;">
<tr><td align="center">

  <!-- ═══════════════ OUTER CARD ═══════════════ -->
  <table border="0" cellpadding="0" cellspacing="0" width="620"
         style="max-width:620px;background-color:#0f172a;border:1px solid #1e293b;
                border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.6);">

    <!-- ──────────── HEADER ──────────── -->
    <tr>
      <td style="background:linear-gradient(135deg,#3730a3 0%,#6d28d9 45%,#a855f7 100%);padding:36px 32px 28px;text-align:center;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center">
              <img src="cid:profile-pic" alt="Shatadal Sundar Sinha" width="88" height="88"
                   style="display:block;border-radius:50%;border:3px solid rgba(255,255,255,0.45);
                          box-shadow:0 0 0 6px rgba(168,85,247,0.3),0 6px 20px rgba(0,0,0,0.4);" />
            </td>
          </tr>
          <tr>
            <td style="padding-top:14px;font-size:27px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
              Shatadal Sundar Sinha
            </td>
          </tr>
          <tr>
            <td style="padding-top:7px;font-size:11.5px;font-weight:700;color:#ddd6fe;
                        text-transform:uppercase;letter-spacing:0.1em;">
              Senior Front-End Developer &bull; React.js &bull; Next.js &bull; Angular &bull; TypeScript &bull; Node.js &bull; AI&nbsp;Agents
            </td>
          </tr>
          <!-- Contact bar -->
          <tr>
            <td style="padding-top:12px; text-align:center;">
              <table border="0" cellpadding="0" cellspacing="0" style="margin:0 auto; max-width:480px;">
                <tr>
                  <td align="center" style="font-size:12px;color:#c4b5fd;padding-bottom:5px;">
                    ✉&nbsp;<a href="mailto:shatadal17@gmail.com" style="color:#e0e7ff;font-weight:600;text-decoration:none;">shatadal17@gmail.com</a>
                    &nbsp;&nbsp;&nbsp;&bull;&nbsp;&nbsp;&nbsp;
                    📍&nbsp;<span style="color:#e0e7ff;font-weight:600;white-space:nowrap;">Kolkata, West Bengal, India</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:12.5px;color:#c4b5fd;">
                    📞&nbsp;<span style="color:#e0e7ff;font-weight:600;white-space:nowrap;">+91 70636 44658</span>
                    &nbsp;&nbsp;/&nbsp;&nbsp;
                    <span style="color:#e0e7ff;font-weight:600;white-space:nowrap;">+91 93824 68250</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- AI Agent live link -->
          <tr>
            <td style="padding-top:10px;font-size:12px;color:#a78bfa;">
              🤖 Personal AI Agent:&nbsp;
              <a href="https://shatadalpersonalassistent.vercel.app" style="color:#f0abfc;font-weight:700;">
                shatadalpersonalassistent.vercel.app
              </a>
              &nbsp;— built &amp; deployed by me; ask it anything about my background
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ──────────── BODY ──────────── -->
    <tr>
      <td style="padding:28px 30px;background-color:#0f172a;">

        <!-- QUICK STATS -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
          <tr>
            <td width="19%" align="center" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:11px 6px;">
              <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;">EXPERIENCE</div>
              <div style="font-size:15px;font-weight:800;color:#38bdf8;">~5 Yrs</div>
            </td>
            <td width="2%"></td>
            <td width="19%" align="center" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:11px 6px;">
              <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;">CORE</div>
              <div style="font-size:12.5px;font-weight:800;color:#a78bfa;white-space:nowrap;">React/Next/</div>
            </td>
            <td width="2%"></td>
            <td width="19%" align="center" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:11px 6px;">
              <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;">DOMAIN</div>
              <div style="font-size:10px;font-weight:800;color:#fb923c;white-space:nowrap;">SaaS/EdTech/Ai Agent</div>
            </td>
            <td width="2%"></td>
            <td width="19%" align="center" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:11px 6px;">
              <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;">NOTICE</div>
              <div style="font-size:13px;font-weight:800;color:#34d399;">Immediate</div>
            </td>
            <td width="2%"></td>
            <td width="19%" align="center" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:11px 6px;">
              <div style="font-size:7px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0px;margin-bottom:3px;line-height:1.1;">SALARY EXPECTATION</div>
              <div style="font-size:13px;font-weight:800;color:#f472b6;white-space:nowrap;">10–14 LPA</div>
            </td>
          </tr>
        </table>

        <!-- CUSTOM MESSAGE -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
          <tr>
            <td style="font-size:14.5px;line-height:1.65;color:#cbd5e1;">
              ${formattedMessage}
            </td>
          </tr>
        </table>

        ${divider}

        <!-- ═══ PROFESSIONAL SUMMARY ═══ -->
        ${sectionTitle('🎯', 'Professional Summary')}
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:6px;">
          <tr>
            <td style="font-size:13px;line-height:1.75;color:#94a3b8;background-color:#1e293b;
                        border:1px solid #334155;border-radius:10px;padding:15px 17px;">
              Senior Front-End Developer with approximately <strong style="color:#e2e8f0;">5 years of experience</strong>
              building high-performance web applications across
              <strong style="color:#38bdf8;">SaaS, EdTech, and PropTech</strong> domains.
              Specialises in <strong style="color:#a78bfa;">React.js, Next.js, and TypeScript</strong> on the front end,
              with additional experience in <strong style="color:#f472b6;">Angular</strong> for component-driven UI development.
              Hands-on backend experience in <strong style="color:#34d399;">Node.js, EJS templating, and MongoDB</strong>,
              with a growing focus on designing and deploying
              <strong style="color:#fb923c;">autonomous AI agents</strong> — including browser-automation agents for
              end-to-end workflow automation and conversational chatbot agents for business use cases.
              Proven track record in leading product development, integrating payment gateways, designing REST APIs,
              and leveraging AI-assisted workflows — consistently delivering clean, scalable solutions in
              cross-functional teams.
            </td>
          </tr>
        </table>

        ${divider}

        <!-- ═══ WORK EXPERIENCE ═══ -->
        ${sectionTitle('💼', 'Work Experience')}

        <!-- ── JOB 1: Webskitters ── -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%"
               style="background-color:#1e293b;border:1.5px solid #4f46e5;border-radius:12px;margin-bottom:14px;">
          <tr>
            <td style="padding:16px 18px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size:14.5px;font-weight:800;color:#818cf8;">Senior Front-End Developer</td>
                  <td align="right" style="font-size:11px;color:#64748b;white-space:nowrap;">Aug 2024 – Present</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:3px;font-size:12.5px;color:#a78bfa;font-weight:600;">
                    Webskitters Technology Solutions Pvt. Ltd. — Kolkata, India
                  </td>
                </tr>
              </table>

              <!-- Sub-project 1 -->
              <div style="margin-top:13px;padding:12px 14px;background-color:#0f172a;border:1px solid #334155;border-radius:8px;">
                <div style="font-size:12.5px;font-weight:700;color:#38bdf8;margin-bottom:7px;">
                  📦 WebSkitters Academy — Student CRM Portal <span style="font-size:10.5px;color:#64748b;font-weight:400;">(In-house Product, Front-End Lead)</span>
                </div>
                <div style="font-size:12px;line-height:1.75;color:#94a3b8;">
                  &bull;&nbsp;Led front-end development from scratch, owning architecture and delivery across the full product lifecycle.<br/>
                  &bull;&nbsp;Built a scalable component system using <strong style="color:#e2e8f0;">Next.js, TypeScript, and Material UI</strong> actively serving hundreds of students and admins.<br/>
                  &bull;&nbsp;Converted Figma wireframes into pixel-perfect, fully responsive pages with zero design debt.<br/>
                  &bull;&nbsp;Collaborated with back-end engineers on REST API integration, defining data-flow and error-handling patterns.<br/>
                  &bull;&nbsp;Integrated <strong style="color:#e2e8f0;">Razorpay, Cashfree, and Instamojo</strong> payment gateways for real-time fee collection with automated confirmation workflows.<br/>
                  &bull;&nbsp;Achieved <strong style="color:#34d399;">sub-2s LCP</strong> on key pages, directly improving user retention metrics.
                </div>
                <div style="margin-top:8px;">
                  ${tag('Next.js', '#38bdf8')}${tag('TypeScript', '#a78bfa')}${tag('Material UI', '#f472b6')}${tag('Razorpay', '#fb923c')}${tag('Cashfree')}${tag('Instamojo')}
                </div>
              </div>

              <!-- Sub-project 2 -->
              <div style="margin-top:10px;padding:12px 14px;background-color:#0f172a;border:1px solid #334155;border-radius:8px;">
                <div style="font-size:12.5px;font-weight:700;color:#a78bfa;margin-bottom:7px;">
                  📦 Qpulse AI-Powered Resume Builder <span style="font-size:10.5px;color:#64748b;font-weight:400;">(Client Project, USA)</span>
                </div>
                <div style="font-size:12px;line-height:1.75;color:#94a3b8;">
                  &bull;&nbsp;Built an AI-driven resume builder and admin dashboard using <strong style="color:#e2e8f0;">Next.js and TypeScript</strong> with multiple AI model backends.<br/>
                  &bull;&nbsp;Developed personalised career roadmap features and a real-time AI chatbot for end-to-end interactive experience.<br/>
                  &bull;&nbsp;Assisted in lightweight backend tasks — built and consumed <strong style="color:#e2e8f0;">Node.js REST APIs</strong> for data persistence and user session management.<br/>
                  &bull;&nbsp;Leveraged AI coding assistants (<strong style="color:#e2e8f0;">Claude AI, Amazon Q, GLM AI</strong>) to accelerate feature delivery and streamline code reviews.
                </div>
                <div style="margin-top:8px;">
                  ${tag('Next.js', '#38bdf8')}${tag('TypeScript', '#a78bfa')}${tag('AI Chatbot', '#fb923c')}${tag('Node.js', '#34d399')}${tag('REST APIs')}
                </div>
              </div>

              <!-- Sub-project 3 -->
              <div style="margin-top:10px;padding:12px 14px;background-color:#0f172a;border:1px solid #334155;border-radius:8px;">
                <div style="font-size:12.5px;font-weight:700;color:#34d399;margin-bottom:7px;">
                  🤖 AI Job-Application Automation Agent <span style="font-size:10.5px;color:#64748b;font-weight:400;">(Self-Initiated Project)</span>
                </div>
                <div style="font-size:12px;line-height:1.75;color:#94a3b8;">
                  &bull;&nbsp;Designing and building an autonomous AI agent that uses Chrome browser access to automate the job-search workflow, performing <strong style="color:#e2e8f0;">mass auto-apply</strong> across LinkedIn, Naukri, and Indeed.<br/>
                  &bull;&nbsp;Architecting the agent's browser-automation and decision logic to identify relevant listings and submit applications with minimal manual intervention.<br/>
                  &bull;&nbsp;Applying AI-assisted development practices to independently design, build, and iterate end-to-end.
                </div>
                <div style="margin-top:8px;">
                  ${tag('Playwright', '#34d399')}${tag('TypeScript', '#a78bfa')}${tag('Groq AI', '#fb923c')}${tag('Browser Automation')}${tag('Stealth API')}
                </div>
              </div>

              <!-- Sub-project 4 -->
              <div style="margin-top:10px;padding:12px 14px;background-color:#0f172a;border:1px solid #334155;border-radius:8px;">
                <div style="font-size:12.5px;font-weight:700;color:#fb923c;margin-bottom:7px;">
                  🤖 Personal AI Agent — Shatadal Personal Assistant <span style="font-size:10.5px;color:#64748b;font-weight:400;">(Self-Initiated)</span>
                </div>
                <div style="font-size:12px;line-height:1.75;color:#94a3b8;">
                  &bull;&nbsp;Designed and deployed a personal conversational AI agent available at
                  <a href="https://shatadalpersonalassistent.vercel.app" style="color:#f0abfc;">shatadalpersonalassistent.vercel.app</a>
                  that answers questions about my background, skills, and experience.<br/>
                  &bull;&nbsp;Built end-to-end as a light full-stack project, handling both the front-end interface and the backend/agent logic.<br/>
                  &bull;&nbsp;Applied AI-assisted development practices to design, build, and deploy independently, reflecting growing full-stack and AI-agent capability.
                </div>
                <div style="margin-top:8px;">
                  ${tag('Next.js', '#38bdf8')}${tag('AI Agent', '#fb923c')}${tag('Full-Stack', '#34d399')}${tag('Vercel')}
                </div>
              </div>

              <!-- Sub-project 5 -->
              <div style="margin-top:10px;padding:12px 14px;background-color:#0f172a;border:1px solid #334155;border-radius:8px;">
                <div style="font-size:12.5px;font-weight:700;color:#f472b6;margin-bottom:7px;">
                  💬 CSA Media Solutions — Customer Support Chatbot Agent <span style="font-size:10.5px;color:#64748b;font-weight:400;">(Independent Project)</span>
                </div>
                <div style="font-size:12px;line-height:1.75;color:#94a3b8;">
                  &bull;&nbsp;Built and deployed a lightweight AI chatbot agent for CSA Media Solutions to handle business queries and customer interactions.<br/>
                  &bull;&nbsp;Designed conversational flows and integrated the agent end-to-end as a light full-stack build.
                </div>
                <div style="margin-top:8px;">
                  ${tag('AI Chatbot', '#f472b6')}${tag('Conversational AI', '#fb923c')}${tag('Full-Stack')}
                </div>
              </div>
            </td>
          </tr>
        </table>

        <!-- ── JOB 2: Ebrotech ── -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%"
               style="background-color:#1e293b;border:1.5px solid #334155;border-radius:12px;margin-bottom:14px;">
          <tr>
            <td style="padding:16px 18px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size:14.5px;font-weight:800;color:#38bdf8;">Front-End Developer</td>
                  <td align="right" style="font-size:11px;color:#64748b;white-space:nowrap;">Jun 2023 – Aug 2024</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:3px;font-size:12.5px;color:#60a5fa;font-weight:600;">
                    Ebrotech Software Solutions Pvt. Ltd. — Ghaziabad, India
                  </td>
                </tr>
              </table>

              <!-- Tenant Management -->
              <div style="margin-top:13px;padding:12px 14px;background-color:#0f172a;border:1px solid #334155;border-radius:8px;">
                <div style="font-size:12.5px;font-weight:700;color:#38bdf8;margin-bottom:7px;">📦 Tenant Management System</div>
                <div style="font-size:12px;line-height:1.75;color:#94a3b8;">
                  &bull;&nbsp;Designed and built the full UI for a web and mobile rent management app — tenant records, rent tracking, and landlord dashboards using <strong style="color:#e2e8f0;">React.js and Ant Design</strong>.<br/>
                  &bull;&nbsp;Integrated MongoDB-backed REST APIs for real-time data sync; maintained <strong style="color:#34d399;">99% uptime</strong> through thorough end-to-end testing.
                </div>
                <div style="margin-top:8px;">${tag('React.js', '#38bdf8')}${tag('Ant Design', '#a78bfa')}${tag('MongoDB')}${tag('REST APIs')}</div>
              </div>

              <!-- Visitor Management -->
              <div style="margin-top:10px;padding:12px 14px;background-color:#0f172a;border:1px solid #334155;border-radius:8px;">
                <div style="font-size:12.5px;font-weight:700;color:#a78bfa;margin-bottom:7px;">📦 Visitor Management Platform</div>
                <div style="font-size:12px;line-height:1.75;color:#94a3b8;">
                  &bull;&nbsp;Built a type-safe visitor scheduling system with <strong style="color:#e2e8f0;">React.js and TypeScript</strong>; strict typing and validation reduced runtime bugs by <strong style="color:#34d399;">~40%</strong>.<br/>
                  &bull;&nbsp;Contributed to lightweight backend routes using <strong style="color:#e2e8f0;">Node.js and EJS</strong> for server-side rendered admin views.
                </div>
                <div style="margin-top:8px;">${tag('React.js', '#38bdf8')}${tag('TypeScript', '#a78bfa')}${tag('Node.js', '#34d399')}${tag('EJS')}</div>
              </div>

              <!-- Entra Office App -->
              <div style="margin-top:10px;padding:12px 14px;background-color:#0f172a;border:1px solid #334155;border-radius:8px;">
                <div style="font-size:12.5px;font-weight:700;color:#34d399;margin-bottom:7px;">📦 Entra Office App</div>
                <div style="font-size:12px;line-height:1.75;color:#94a3b8;">
                  &bull;&nbsp;Built a feature-rich office management application covering meeting room bookings, visitor tracking, staff management, and expense reporting.<br/>
                  &bull;&nbsp;Worked on select <strong style="color:#e2e8f0;">Angular-based modules</strong> for internal dashboard views, gaining hands-on experience with Angular components and services.
                </div>
                <div style="margin-top:8px;">${tag('Angular', '#f472b6')}${tag('React.js', '#38bdf8')}${tag('Dashboard')}${tag('Office App')}</div>
              </div>
            </td>
          </tr>
        </table>

        <!-- ── JOB 3: Brenolabs Full-Time ── -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%"
               style="background-color:#1e293b;border:1.5px solid #334155;border-radius:12px;margin-bottom:14px;">
          <tr>
            <td style="padding:16px 18px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size:14.5px;font-weight:800;color:#34d399;">Front-End Developer</td>
                  <td align="right" style="font-size:11px;color:#64748b;white-space:nowrap;">Jul 2022 – May 2023</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:3px;font-size:12.5px;color:#34d399;font-weight:600;">
                    Brenolabs Pvt. Ltd. — Bengaluru, India
                  </td>
                </tr>
              </table>
              <div style="margin-top:13px;font-size:12px;line-height:1.75;color:#94a3b8;">
                &bull;&nbsp;<strong style="color:#e2e8f0;">Doctor Appointment System:</strong> Delivered a responsive doctor availability and booking platform using <strong style="color:#e2e8f0;">React.js, Bootstrap, and Tailwind CSS</strong>.<br/>
                &bull;&nbsp;<strong style="color:#e2e8f0;">School Management System:</strong> Contributed to a centralised school operations platform using HTML5, CSS3, and JavaScript, with <strong style="color:#e2e8f0;">Node.js + MongoDB</strong> powering the backend.
              </div>
              <div style="margin-top:8px;">${tag('React.js', '#38bdf8')}${tag('Tailwind CSS', '#34d399')}${tag('Bootstrap')}${tag('Node.js', '#a78bfa')}${tag('MongoDB')}</div>
            </td>
          </tr>
        </table>

        <!-- ── JOB 4: Brenolabs Intern ── -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%"
               style="background-color:#1e293b;border:1.5px solid #334155;border-radius:12px;margin-bottom:6px;">
          <tr>
            <td style="padding:16px 18px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size:14.5px;font-weight:800;color:#fbbf24;">Front-End Developer Intern</td>
                  <td align="right" style="font-size:11px;color:#64748b;white-space:nowrap;">Sep 2021 – Feb 2022</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:3px;font-size:12.5px;color:#fbbf24;font-weight:600;">
                    Brenolabs Pvt. Ltd. — Bengaluru, India
                  </td>
                </tr>
              </table>
              <div style="margin-top:13px;font-size:12px;line-height:1.75;color:#94a3b8;">
                &bull;&nbsp;Built the front-end of a full-featured e-commerce platform — product listings, shopping cart, authentication, and payment integration using <strong style="color:#e2e8f0;">React.js, TypeScript, HTML5, CSS3, and Bootstrap</strong>.<br/>
                &bull;&nbsp;Gained initial exposure to <strong style="color:#e2e8f0;">Node.js/Express</strong> backend patterns and <strong style="color:#e2e8f0;">MongoDB</strong> data modelling during the project.
              </div>
              <div style="margin-top:8px;">${tag('React.js', '#38bdf8')}${tag('TypeScript', '#a78bfa')}${tag('Bootstrap')}${tag('Node.js', '#34d399')}${tag('MongoDB')}${tag('Express.js')}</div>
            </td>
          </tr>
        </table>

        ${divider}

        <!-- ═══ TECHNICAL SKILLS ═══ -->
        ${sectionTitle('⚙️', 'Technical Skills')}
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:6px;">

          <!-- Row 1 -->
          <tr>
            <td width="48%" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:13px 15px;vertical-align:top;">
              <div style="font-size:10px;font-weight:800;color:#38bdf8;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Front-End</div>
              <div style="font-size:12.5px;color:#cbd5e1;line-height:1.7;">React.js &bull; Next.js &bull; Angular &bull; TypeScript &bull; JavaScript (ES6+) &bull; HTML5 &bull; CSS3</div>
            </td>
            <td width="4%"></td>
            <td width="48%" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:13px 15px;vertical-align:top;">
              <div style="font-size:10px;font-weight:800;color:#a78bfa;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Back-End</div>
              <div style="font-size:12.5px;color:#cbd5e1;line-height:1.7;">Node.js &bull; Express.js &bull; EJS &bull; REST API Design &amp; Integration</div>
            </td>
          </tr>
          <tr><td colspan="3" style="height:8px;"></td></tr>

          <!-- Row 2 -->
          <tr>
            <td colspan="3" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:13px 15px;">
              <div style="font-size:10px;font-weight:800;color:#fb923c;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">AI Agents &amp; Tooling</div>
              <div style="font-size:12.5px;color:#cbd5e1;line-height:1.7;">
                Designing &amp; deploying <strong style="color:#e2e8f0;">autonomous AI agents</strong> (browser-automation job-apply agent, conversational assistant, business chatbot);
                live demo:&nbsp;<a href="https://shatadalpersonalassistent.vercel.app" style="color:#f0abfc;">shatadalpersonalassistent.vercel.app</a>
              </div>
            </td>
          </tr>
          <tr><td colspan="3" style="height:8px;"></td></tr>

          <!-- Row 3 -->
          <tr>
            <td width="48%" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:13px 15px;vertical-align:top;">
              <div style="font-size:10px;font-weight:800;color:#34d399;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Database</div>
              <div style="font-size:12.5px;color:#cbd5e1;line-height:1.7;">MongoDB &bull; Mongoose</div>
            </td>
            <td width="4%"></td>
            <td width="48%" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:13px 15px;vertical-align:top;">
              <div style="font-size:10px;font-weight:800;color:#60a5fa;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">State Management</div>
              <div style="font-size:12.5px;color:#cbd5e1;line-height:1.7;">Redux &bull; Context API &bull; React Query</div>
            </td>
          </tr>
          <tr><td colspan="3" style="height:8px;"></td></tr>

          <!-- Row 4 -->
          <tr>
            <td width="48%" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:13px 15px;vertical-align:top;">
              <div style="font-size:10px;font-weight:800;color:#f472b6;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">UI Libraries</div>
              <div style="font-size:12.5px;color:#cbd5e1;line-height:1.7;">Material UI (MUI) &bull; Ant Design &bull; Tailwind CSS &bull; SCSS/SASS &bull; Bootstrap</div>
            </td>
            <td width="4%"></td>
            <td width="48%" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:13px 15px;vertical-align:top;">
              <div style="font-size:10px;font-weight:800;color:#fbbf24;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Payment Gateways</div>
              <div style="font-size:12.5px;color:#cbd5e1;line-height:1.7;">Razorpay &bull; Cashfree &bull; Instamojo</div>
            </td>
          </tr>
          <tr><td colspan="3" style="height:8px;"></td></tr>

          <!-- Row 5 -->
          <tr>
            <td width="48%" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:13px 15px;vertical-align:top;">
              <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Tools &amp; Workflow</div>
              <div style="font-size:12.5px;color:#cbd5e1;line-height:1.7;">Git/GitHub &bull; VS Code &bull; Figma &bull; Performance Optimisation &bull; Agile / Scrum</div>
            </td>
            <td width="4%"></td>
            <td width="48%" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:13px 15px;vertical-align:top;">
              <div style="font-size:10px;font-weight:800;color:#c084fc;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">AI Dev Tools</div>
              <div style="font-size:12.5px;color:#cbd5e1;line-height:1.7;">Claude AI &bull; Amazon Q &bull; GLM AI &bull; Antigravity AI</div>
            </td>
          </tr>
          <tr><td colspan="3" style="height:8px;"></td></tr>

          <!-- Row 6 — Soft Skills -->
          <tr>
            <td colspan="3" style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:13px 15px;">
              <div style="font-size:10px;font-weight:800;color:#e2e8f0;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Soft Skills</div>
              <div style="font-size:12.5px;color:#cbd5e1;line-height:1.7;">Front-End Leadership &bull; Cross-functional Collaboration &bull; Clean Code Practices</div>
            </td>
          </tr>

        </table>

        ${divider}

        <!-- ═══ EDUCATION ═══ -->
        ${sectionTitle('🎓', 'Education')}
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
          <tr>
            <td style="background-color:#1e293b;border:1px solid #334155;border-radius:10px;padding:15px 17px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size:14.5px;font-weight:800;color:#38bdf8;">B.Tech in Computer Science &amp; Engineering</td>
                  <td align="right" style="font-size:11px;color:#64748b;white-space:nowrap;">2018 – 2022</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:4px;font-size:12.5px;color:#94a3b8;">
                    Maulana Abul Kalam Azad University of Technology (MAKAUT), West Bengal
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:6px;">
                    <span style="font-size:13px;font-weight:700;color:#34d399;">CGPA: 8.57 / 10</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- ═══ CTA BUTTONS ═══ -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center">
              <a href="https://shatadalpersonalassistent.vercel.app" target="_blank"
                 style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);
                        border:1px solid #6d28d9;border-radius:9px;color:#ffffff;font-size:13.5px;
                        font-weight:700;padding:13px 24px;text-decoration:none;
                        box-shadow:0 4px 14px rgba(109,40,217,0.4);margin-right:8px;">
                🤖 Chat with My AI Agent
              </a>
              <a href="https://www.linkedin.com/in/shatadal-sundar-sinha-96b27b239/" target="_blank"
                 style="display:inline-block;background-color:#1e293b;border:1px solid #334155;
                        border-radius:9px;color:#e2e8f0;font-size:13.5px;font-weight:700;
                        padding:13px 24px;text-decoration:none;">
                🔗 Connect on LinkedIn
              </a>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <!-- ──────────── FOOTER ──────────── -->
    <tr>
      <td style="background-color:#020617;border-top:1px solid #1e293b;padding:22px 30px;text-align:center;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="font-size:11.5px;color:#475569;line-height:1.6;">
              <strong style="color:#64748b;">Shatadal Sundar Sinha</strong> &nbsp;&bull;&nbsp; Senior Front-End Developer<br/>
              Kolkata, West Bengal, India &nbsp;&bull;&nbsp;
              <a href="mailto:shatadal17@gmail.com" style="color:#6366f1;">shatadal17@gmail.com</a>
              &nbsp;&bull;&nbsp; <span style="white-space:nowrap;">+91 70636 44658</span> &nbsp;/&nbsp; <span style="white-space:nowrap;">+91 93824 68250</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top:8px;font-size:10px;color:#1e293b;">
              This is an automated outreach email containing professional profile credentials.
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>
  <!-- ═══════════════ END CARD ═══════════════ -->

</td></tr>
</table>
</body>
</html>
  `;
}
