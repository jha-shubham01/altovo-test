"""Generate two fictional, demo-only test PDFs for the Altovo DocQA RAG app.

Doc 1: northwind-employee-handbook.pdf (4 pages)
Doc 2: northwind-it-security-policy.pdf (3 pages)

Facts are placed on specific pages with distinctive citable tokens and a
deliberate cross-document conflict (laptop refresh 3 vs 4 years).
"""

import os

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    PageBreak,
)

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

styles = getSampleStyleSheet()

H_TITLE = ParagraphStyle(
    "HTitle", parent=styles["Title"], fontSize=18, spaceAfter=6, leading=22
)
H_SUB = ParagraphStyle(
    "HSub", parent=styles["Normal"], fontSize=10, textColor="#555555", spaceAfter=16
)
H1 = ParagraphStyle(
    "H1", parent=styles["Heading1"], fontSize=14, spaceBefore=10, spaceAfter=6
)
BODY = ParagraphStyle(
    "Body", parent=styles["BodyText"], fontSize=11, leading=15, spaceAfter=8
)


def build_handbook():
    path = os.path.join(OUT_DIR, "northwind-employee-handbook.pdf")
    doc = SimpleDocTemplate(
        path,
        pagesize=LETTER,
        topMargin=0.9 * inch,
        bottomMargin=0.9 * inch,
        leftMargin=1 * inch,
        rightMargin=1 * inch,
        title="Northwind Robotics — Employee Handbook v5.1",
    )
    s = []

    # ---- Page 1 ----
    s.append(Paragraph("Northwind Robotics — Employee Handbook", H_TITLE))
    s.append(
        Paragraph(
            "Version 5.1 &mdash; effective 1 Feb 2026. "
            "This is a fictional document created for demonstration and testing only.",
            H_SUB,
        )
    )
    s.append(Paragraph("Section 1 &mdash; Onboarding", H1))
    s.append(
        Paragraph(
            "Welcome to Northwind Robotics. All new hires complete a structured "
            "onboarding program during their first two weeks. Onboarding covers "
            "workstation setup, benefits enrollment, and an introduction to the "
            "engineering and operations teams.",
            BODY,
        )
    )
    s.append(
        Paragraph(
            "New employees are subject to a probationary period governed by policy "
            "code <b>HR-204</b>. Under policy <b>HR-204</b>, the probation period is "
            "<b>90 days</b> from the employee's start date. During this 90-day "
            "probation, either the employee or Northwind Robotics may end the "
            "employment relationship with shortened notice, and performance is "
            "reviewed at the 30-day and 60-day marks.",
            BODY,
        )
    )
    s.append(
        Paragraph(
            "Onboarding buddies are assigned to every new hire to help them settle "
            "in. Questions about onboarding logistics should be directed to the "
            "People Operations team.",
            BODY,
        )
    )
    s.append(PageBreak())

    # ---- Page 2 ----
    s.append(Paragraph("Section 2 &mdash; Time Off", H1))
    s.append(
        Paragraph(
            "Full-time employees at Northwind Robotics accrue <b>22 days of paid "
            "time off (PTO) per year</b>. In addition, employees receive "
            "<b>10 days of sick leave per year</b>, which is tracked separately from "
            "PTO.",
            BODY,
        )
    )
    s.append(
        Paragraph(
            "Employees who resign must provide a <b>notice period of 30 days</b> "
            "before their final working day. Unused PTO may be carried into the next "
            "calendar year up to a <b>carryover cap of 5 days</b>; any PTO above the "
            "5-day cap is forfeited at year end.",
            BODY,
        )
    )
    s.append(Paragraph("Section 3 &mdash; Remote Work", H1))
    s.append(
        Paragraph(
            "Northwind Robotics supports a hybrid working model. Eligible employees "
            "may work remotely for <b>up to 3 days per week</b>, with the remaining "
            "days spent in the office to support in-person collaboration.",
            BODY,
        )
    )
    s.append(PageBreak())

    # ---- Page 3 ----
    s.append(Paragraph("Section 3 &mdash; Remote Work (continued)", H1))
    s.append(
        Paragraph(
            "To support home-based work, the company provides a <b>home-office "
            "stipend of $400 per year</b>. The stipend may be used for ergonomic "
            "equipment, monitors, or other approved home-office supplies, and is "
            "reimbursed against submitted receipts.",
            BODY,
        )
    )
    s.append(Paragraph("Section 4 &mdash; Expenses", H1))
    s.append(
        Paragraph(
            "When traveling for business, employees may claim a <b>meal per-diem of "
            "$75 per day</b>. Per-diem covers breakfast, lunch, and dinner and does "
            "not require itemized receipts.",
            BODY,
        )
    )
    s.append(
        Paragraph(
            "Northwind Robotics issues company laptops to all employees. "
            "<b>Company laptops are refreshed every 3 years</b>, at which point the "
            "employee receives a new device and returns the old one to IT.",
            BODY,
        )
    )
    s.append(
        Paragraph(
            "Expense reports must be submitted <b>within 14 days</b> of the expense "
            "being incurred. Reports submitted after the 14-day window may be "
            "delayed or denied.",
            BODY,
        )
    )
    s.append(PageBreak())

    # ---- Page 4 ----
    s.append(Paragraph("Section 5 &mdash; Code of Conduct", H1))
    s.append(
        Paragraph(
            "All employees are expected to act with integrity, treat colleagues with "
            "respect, and avoid conflicts of interest. Harassment and discrimination "
            "of any kind are prohibited. Employees must protect confidential company "
            "and customer information at all times.",
            BODY,
        )
    )
    s.append(
        Paragraph(
            "Northwind Robotics maintains a whistleblowing channel for reporting "
            "unethical or unlawful conduct. Concerns may be reported confidentially "
            "to the Ethics Office at ethics@northwind-robotics.example. Retaliation "
            "against anyone who reports a concern in good faith is strictly "
            "prohibited.",
            BODY,
        )
    )
    s.append(
        Paragraph(
            "Violations of this Code of Conduct may result in disciplinary action up "
            "to and including termination of employment.",
            BODY,
        )
    )

    doc.build(s)
    return path


def build_security_policy():
    path = os.path.join(OUT_DIR, "northwind-it-security-policy.pdf")
    doc = SimpleDocTemplate(
        path,
        pagesize=LETTER,
        topMargin=0.9 * inch,
        bottomMargin=0.9 * inch,
        leftMargin=1 * inch,
        rightMargin=1 * inch,
        title="Northwind Robotics — IT & Security Policy v2.3",
    )
    s = []

    # ---- Page 1 ----
    s.append(Paragraph("Northwind Robotics — IT &amp; Security Policy", H_TITLE))
    s.append(
        Paragraph(
            "Version 2.3 &mdash; effective 1 Jan 2026. "
            "This is a fictional document created for demonstration and testing only.",
            H_SUB,
        )
    )
    s.append(Paragraph("Section 1 &mdash; Access Control", H1))
    s.append(
        Paragraph(
            "Access to Northwind Robotics systems is governed by access-control "
            "standard <b>SEC-11</b>. Under standard <b>SEC-11</b>, access is granted "
            "on a least-privilege basis and reviewed quarterly.",
            BODY,
        )
    )
    s.append(
        Paragraph(
            "<b>Multi-factor authentication (MFA) is required for all accounts</b>, "
            "without exception. This includes email, VPN, source-control, and "
            "cloud-console access.",
            BODY,
        )
    )
    s.append(Paragraph("Section 2 &mdash; Passwords", H1))
    s.append(
        Paragraph(
            "Passwords must be <b>rotated every 90 days</b>. Reuse of the previous "
            "five passwords is not permitted.",
            BODY,
        )
    )
    s.append(PageBreak())

    # ---- Page 2 ----
    s.append(Paragraph("Section 2 &mdash; Passwords (continued)", H1))
    s.append(
        Paragraph(
            "All passwords must have a <b>minimum length of 14 characters</b> and "
            "should combine upper- and lower-case letters, numbers, and symbols. "
            "Passwords must never be shared or stored in plaintext.",
            BODY,
        )
    )
    s.append(Paragraph("Section 3 &mdash; Device Management", H1))
    s.append(
        Paragraph(
            "IT manages the full lifecycle of company devices. "
            "<b>Company laptops are replaced every 4 years</b> under the IT device "
            "lifecycle standard. When a laptop reaches its 4-year replacement point, "
            "IT provisions a new device and securely wipes and retires the old one.",
            BODY,
        )
    )
    s.append(
        Paragraph(
            "All company laptops must run full-disk encryption and the approved "
            "endpoint-protection agent before being issued to an employee.",
            BODY,
        )
    )
    s.append(Paragraph("Section 4 &mdash; Data Retention", H1))
    s.append(
        Paragraph(
            "Security logs are <b>retained for 180 days</b> to support incident "
            "investigation and audit requirements.",
            BODY,
        )
    )
    s.append(PageBreak())

    # ---- Page 3 ----
    s.append(Paragraph("Section 4 &mdash; Data Retention (continued)", H1))
    s.append(
        Paragraph(
            "System backups are <b>retained for 30 days</b> on a rolling basis. "
            "Backups older than 30 days are automatically purged unless placed under "
            "a legal hold.",
            BODY,
        )
    )
    s.append(Paragraph("Section 5 &mdash; Incident Response", H1))
    s.append(
        Paragraph(
            "Any suspected security incident &mdash; including lost devices, phishing, "
            "or unauthorized access &mdash; <b>must be reported within 24 hours</b> to "
            "the security team at security@northwind-robotics.example.",
            BODY,
        )
    )
    s.append(
        Paragraph(
            "The security team triages every report, coordinates containment and "
            "remediation, and produces a post-incident review for significant "
            "events.",
            BODY,
        )
    )

    doc.build(s)
    return path


if __name__ == "__main__":
    p1 = build_handbook()
    p2 = build_security_policy()
    print("Wrote:", p1)
    print("Wrote:", p2)
