/**
 * Generates a modern, beautifully designed HTML outreach template for recruiters.
 * Uses inline CSS compatible with popular email clients.
 */
export function getGraphicOutreachTemplate(customMessage: string): string {
  // Replace newlines with HTML line breaks for proper email rendering
  const formattedMessage = customMessage.replace(/\n/g, '<br />');

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <title>Senior Frontend Developer - Shatadal Sundar Sinha</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style type="text/css">
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      background-color: #020617;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    table {
      border-collapse: collapse !important;
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #020617;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #020617; padding: 20px 0;">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          
          <!-- Glowing Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #c084fc 100%); padding: 35px 30px; text-align: center;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <!-- Profile Photo Badge -->
                    <table border="0" cellpadding="0" cellspacing="0" style="width: 80px; height: 80px; border-radius: 50%; overflow: hidden; margin: 0 auto;">
                      <tr>
                        <td align="center">
                          <img src="cid:profile-pic" alt="Shatadal Sundar Sinha" width="80" height="80" style="display: block; width: 80px; height: 80px; border-radius: 50%; border: 3px solid rgba(255, 255, 255, 0.4); box-shadow: 0 4px 12px rgba(0,0,0,0.3);" />
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 15px; font-size: 26px; font-weight: 800; color: #ffffff; tracking-tight: -0.025em;">
                    Shatadal Sundar Sinha
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 6px; font-size: 14px; font-weight: 700; color: #e0e7ff; text-transform: uppercase; letter-spacing: 0.1em;">
                    Senior Frontend Developer & UI Engineer
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Body Content Area -->
          <tr>
            <td style="padding: 30px; background-color: #0f172a;">
              
              <!-- Quick Stats Grid Table -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px;">
                <tr>
                  <!-- Stat 1 -->
                  <td width="30%" align="center" style="background-color: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 12px 10px;">
                    <div style="font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px;">EXPERIENCE</div>
                    <div style="font-size: 15px; font-weight: 800; color: #38bdf8;">5 Years</div>
                  </td>
                  <td width="5%"></td>
                  <!-- Stat 2 -->
                  <td width="30%" align="center" style="background-color: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 12px 10px;">
                    <div style="font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px;">CORE TECH</div>
                    <div style="font-size: 15px; font-weight: 800; color: #a78bfa;">React / NextJS</div>
                  </td>
                  <td width="5%"></td>
                  <!-- Stat 3 -->
                  <td width="30%" align="center" style="background-color: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 12px 10px;">
                    <div style="font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px;">LOCATION</div>
                    <div style="font-size: 15px; font-weight: 800; color: #34d399;">Kolkata, IN</div>
                  </td>
                </tr>
              </table>
              
              <!-- Recruiter Greeting and Custom Message -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px;">
                <tr>
                  <td style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                    ${formattedMessage}
                  </td>
                </tr>
              </table>
              
              <!-- Section Divider -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px;">
                <tr>
                  <td style="border-bottom: 1px solid #1e293b;"></td>
                </tr>
              </table>
              
              <!-- Section Title -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 15px;">
                <tr>
                  <td style="font-size: 16px; font-weight: bold; color: #ffffff; text-transform: uppercase; letter-spacing: 0.05em;">
                    🚀 Key Featured Projects
                  </td>
                </tr>
              </table>
              
              <!-- Project 1 Card -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #1e293b; border: 1.5px solid #334155; border-radius: 12px; margin-bottom: 15px;">
                <tr>
                  <td style="padding: 15px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size: 15px; font-weight: bold; color: #38bdf8;">
                          Student CRM Portal (Academy Lead)
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top: 5px; font-size: 13px; line-height: 1.5; color: #94a3b8;">
                          Designed Next.js UI serving hundreds of active students. Optimized load times to sub-2s and integrated payments (Razorpay/Cashfree) for real-time collections.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top: 8px;">
                          <span style="font-size: 11px; font-weight: bold; background-color: #0f172a; color: #e2e8f0; padding: 3px 8px; border-radius: 4px; border: 1px solid #1e293b;">Next.js</span>
                          <span style="font-size: 11px; font-weight: bold; background-color: #0f172a; color: #e2e8f0; padding: 3px 8px; border-radius: 4px; border: 1px solid #1e293b; margin-left: 4px;">TypeScript</span>
                          <span style="font-size: 11px; font-weight: bold; background-color: #0f172a; color: #e2e8f0; padding: 3px 8px; border-radius: 4px; border: 1px solid #1e293b; margin-left: 4px;">Material UI</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Project 2 Card -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #1e293b; border: 1.5px solid #334155; border-radius: 12px; margin-bottom: 15px;">
                <tr>
                  <td style="padding: 15px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size: 15px; font-weight: bold; color: #a78bfa;">
                          Qpulse AI-Resume Builder
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top: 5px; font-size: 13px; line-height: 1.5; color: #94a3b8;">
                          Built interactive AI-driven dashboard for resume creation. Integrated chat interfaces, roadmap visualizations, and REST APIs powered by Node.js.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top: 8px;">
                          <span style="font-size: 11px; font-weight: bold; background-color: #0f172a; color: #e2e8f0; padding: 3px 8px; border-radius: 4px; border: 1px solid #1e293b;">React</span>
                          <span style="font-size: 11px; font-weight: bold; background-color: #0f172a; color: #e2e8f0; padding: 3px 8px; border-radius: 4px; border: 1px solid #1e293b; margin-left: 4px;">Groq AI</span>
                          <span style="font-size: 11px; font-weight: bold; background-color: #0f172a; color: #e2e8f0; padding: 3px 8px; border-radius: 4px; border: 1px solid #1e293b; margin-left: 4px;">Node.js</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Project 3 Card -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #1e293b; border: 1.5px solid #334155; border-radius: 12px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 15px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size: 15px; font-weight: bold; color: #34d399;">
                          Autonomous Job Apply Agent
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top: 5px; font-size: 13px; line-height: 1.5; color: #94a3b8;">
                          Architected browser-automation scripter to auto-apply for jobs on LinkedIn, Naukri, and Indeed. Implemented validation repair engines and email feed scouters.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top: 8px;">
                          <span style="font-size: 11px; font-weight: bold; background-color: #0f172a; color: #e2e8f0; padding: 3px 8px; border-radius: 4px; border: 1px solid #1e293b;">Playwright</span>
                          <span style="font-size: 11px; font-weight: bold; background-color: #0f172a; color: #e2e8f0; padding: 3px 8px; border-radius: 4px; border: 1px solid #1e293b; margin-left: 4px;">Stealth APIs</span>
                          <span style="font-size: 11px; font-weight: bold; background-color: #0f172a; color: #e2e8f0; padding: 3px 8px; border-radius: 4px; border: 1px solid #1e293b; margin-left: 4px;">TypeScript</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Primary Action Buttons -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 10px;">
                <tr>
                  <td align="center">
                    <a href="https://shatadalpersonalassistent.vercel.app" target="_blank" style="display: inline-block; background-color: #4f46e5; border: 1px solid #6366f1; border-radius: 8px; color: #ffffff; font-size: 14px; font-weight: bold; padding: 12px 24px; text-decoration: none; box-shadow: 0 4px 6px rgba(79, 70, 229, 0.25);">
                      Visit Portfolio Website
                    </a>
                    <a href="https://www.linkedin.com/in/shatadal-sundar-sinha-96b27b239/" target="_blank" style="display: inline-block; background-color: #1e293b; border: 1px solid #334155; border-radius: 8px; color: #e2e8f0; font-size: 14px; font-weight: bold; padding: 12px 24px; text-decoration: none; margin-left: 10px;">
                      Connect on LinkedIn
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
          
          <!-- Sleek Footer -->
          <tr>
            <td style="background-color: #020617; border-top: 1px solid #1e293b; padding: 25px 30px; text-align: center;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size: 12px; color: #475569; line-height: 1.5;">
                    Shatadal Sundar Sinha &middot; Senior Frontend Developer<br />
                    Kolkata, West Bengal, India &middot; <a href="mailto:shatadal17@gmail.com" style="color: #6366f1; text-decoration: none;">shatadal17@gmail.com</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 10px; font-size: 10px; color: #334155;">
                    This is an automated outreach email containing professional profile credentials.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
