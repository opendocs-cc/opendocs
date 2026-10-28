import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { capitalized, legalEntity } from "@/lib/legal-entity";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata = buildPageMetadata({
  title: "Privacy Policy",
  description:
    "How OpenDocs collects, uses, and protects your personal data — GDPR-compliant, EU-hosted, with your rights laid out in plain language.",
  url: "https://opendocs.cc/privacy",
});

// The operator's details come from the environment at request time.
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const entity = legalEntity();
  return (
    <LegalPage
      document="privacy"
      title="Privacy Policy"
      summary="What personal data OpenDocs collects, why, who processes it, how long we keep it, and the rights you have over it."
      effective="October 24, 2026"
      updated="October 26, 2026"
    >
      <LegalSection id="introduction" title="Introduction and Data Controller">
        <p>
          Welcome to OpenDocs, a Markdown publishing platform consisting of our website
          (opendocs.cc), command-line interface (CLI), and REST API. This Privacy Policy explains how
          we collect, use, store, and protect your personal data.
        </p>
        <p>
          For the purposes of the General Data Protection Regulation (GDPR) and the Icelandic Data
          Protection Act (Act No. 90/2018), the data controller is:
        </p>
        <p>
          <strong>{capitalized(entity.name)}</strong> (doing business as OpenDocs)<br />
          {entity.registration ? (
            <>
              {capitalized(entity.registration)}
              <br />
            </>
          ) : null}
          {entity.country ? (
            <>
              Country of incorporation: {entity.country}
              <br />
            </>
          ) : null}
          Website: https://opendocs.cc<br />
          Contact email: <a href="mailto:hello@opendocs.cc">hello@opendocs.cc</a>
        </p>
        <p>
          The processing of your personal data is governed by the GDPR (Regulation (EU) 2016/679),
          the Icelandic Data Protection Act (l&ouml;g um pers&oacute;nuvernd og vinnslu
          pers&oacute;nuuppl&yacute;singa nr. 90/2018), and the Icelandic ePrivacy rules (reglur um
          fjarskiptavernd).
        </p>
      </LegalSection>

      <LegalSection id="data-we-collect" title="Data We Collect and Legal Bases for Processing">
        <p>
          We collect specific categories of personal data to provide our services. We rely on the
          following legal bases under the GDPR to process your data:
        </p>

        <h3>2.1. Account Data</h3>
        <p>
          To create and manage your OpenDocs account, we collect your email address, display name,
          username (used in your public profile URL), and hashed password (if using email/password
          authentication). If you authenticate using GitHub or Google OAuth, we receive your name,
          email, profile picture URL, and OAuth provider ID. We also process your API keys, which are
          stored as hashed values (the plaintext is shown only once at creation).
        </p>
        <p>
          <strong>Legal Basis:</strong> Performance of a contract (Art. 6(1)(b) GDPR).
        </p>

        <h3>2.2. User Content</h3>
        <p>
          We process the Markdown files you publish, the rendered HTML versions of those files, and
          document metadata (title, slug, summary, tags, visibility settings, and version history).
          Public documents are accessible to anyone with the URL; workspace-visible documents are
          strictly limited to workspace members.
        </p>
        <p>
          <strong>Legal Basis:</strong> Performance of a contract (Art. 6(1)(b) GDPR).
        </p>

        <h3>2.3. Workspace Data</h3>
        <p>
          If you utilize our collaboration features, we collect the workspace name, workspace slug,
          and membership data detailing which users belong to the workspace and their respective
          roles.
        </p>
        <p>
          <strong>Legal Basis:</strong> Performance of a contract (Art. 6(1)(b) GDPR).
        </p>

        <h3>2.4. Billing Data</h3>
        <p>
          Our Free plan does not require payment processing. For our Pro plan, payments are processed
          by Paddle, our Merchant of Record. We do not collect or store credit card numbers, bank
          details, or full billing addresses. We only receive from Paddle your subscription status,
          plan type, transaction IDs, amounts paid, billing country, and invoice references. Paddle
          acts as an independent data controller for your payment data (see{" "}
          <a href="https://www.paddle.com/legal/privacy" target="_blank" rel="noopener noreferrer">
            Paddle&apos;s Privacy Policy
          </a>
          ).
        </p>
        <p>
          <strong>Legal Basis:</strong> Performance of a contract (Art. 6(1)(b) GDPR) and compliance
          with a legal obligation (Art. 6(1)(c) GDPR).
        </p>

        <h3>2.5. Server Logs and Technical Data</h3>
        <p>
          We automatically collect server logs including your IP address, user agent string (browser
          and device information), requested URLs, timestamps, HTTP status codes, and referrer
          headers. These logs are strictly utilized for security monitoring, debugging, and
          preventing abuse of our platform.
        </p>
        <p>
          <strong>Legal Basis:</strong> Legitimate interests in maintaining the security and
          stability of our service (Art. 6(1)(f) GDPR).
        </p>

        <h3>2.6. Analytics Data (Plausible Analytics)</h3>
        <p>
          We use Plausible Analytics, a privacy-focused, cookie-free analytics tool, to understand
          website traffic. Plausible does not use cookies and does not collect personal data. The data
          collected includes aggregated page views, referrer sources, country (derived from IP; the
          IP address itself is discarded and not stored), browser type, device type, and operating
          system.
        </p>
        <p>
          <strong>Legal Basis:</strong> Legitimate interests in understanding service usage to
          improve our product (Art. 6(1)(f) GDPR).
        </p>

        <h3>2.7. Error Tracking (Sentry)</h3>
        <p>
          When errors or application crashes occur, we use Sentry to capture diagnostic data. This
          may include your IP address, browser and device information, the specific URL where the
          error occurred, and technical stack traces. Sentry does not have access to your user content
          or documents.
        </p>
        <p>
          <strong>Legal Basis:</strong> Legitimate interests in identifying and resolving software
          bugs (Art. 6(1)(f) GDPR).
        </p>

        <h3>2.8. Google Drive Integration</h3>
        <p>
          On paid plans, a workspace owner or admin can connect a Google Drive account so documents
          can be saved into chosen Drive folders. We receive that Google account&apos;s email
          address and account ID and a limited access token, and we store the names and IDs of the
          folders the workspace chose and a record of each file saved. Section 6 describes how we
          handle Google user data, including Google&apos;s Limited Use requirements.
        </p>
        <p>
          <strong>Legal Basis:</strong> Performance of a contract (Art. 6(1)(b) GDPR).
        </p>

        <h3>2.9. DocuSeal Integration (Electronic Signatures)</h3>
        <p>
          On paid plans, a workspace owner or admin can connect the workspace&apos;s own DocuSeal
          account (on docuseal.com in the US, docuseal.eu in the EU, or a self-hosted instance) by
          providing its API key. When a member sends a document for signature, we send the document
          and each signer&apos;s name, email address and role to that DocuSeal account, which emails
          the signers and collects their signatures. We store the signers&apos; names, email
          addresses, roles and signing status, and the status updates DocuSeal sends us. Signed
          documents and audit logs stay in DocuSeal; we fetch them only when a member downloads them
          or saves them elsewhere. DocuSeal processes this data under the workspace&apos;s own
          agreement with DocuSeal and its{" "}
          <a href="https://www.docuseal.com/privacy" target="_blank" rel="noopener noreferrer">
            privacy policy
          </a>
          .
        </p>
        <p>
          <strong>Legal Basis:</strong> Performance of a contract with the workspace (Art. 6(1)(b)
          GDPR). For signers who are not OpenDocs users, legitimate interests in carrying out the
          signing the workspace requested (Art. 6(1)(f) GDPR).
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies and Tracking Technologies">
        <p>
          We use cookies to ensure our platform functions correctly and, provided we have your
          explicit consent, to measure the effectiveness of our marketing campaigns.
        </p>

        <h3>3.1. Strictly Necessary Cookies (No Consent Required)</h3>
        <p>
          We use a session/authentication cookie required to keep you securely logged into your
          account. This cookie is marked HttpOnly, Secure, and is set on the .opendocs.cc domain. It
          expires when you log out or after the session timeout. This cookie is essential for the
          service to function and does not require consent under GDPR or ePrivacy rules.
        </p>

        <h3>3.2. Marketing and Advertising Cookies</h3>
        <p>
          We utilize third-party scripts to evaluate our marketing efforts. If you are in the
          European Economic Area, the United Kingdom or Switzerland,{" "}
          <strong>these are disabled by default</strong> and are only loaded if you provide explicit
          opt-in consent. Elsewhere they load by default, and you can turn them off at any time (see
          3.3):
        </p>
        <ul>
          <li>
            <strong>Meta Pixel (Facebook Pixel):</strong> Measures advertising effectiveness on Meta
            platforms. It sets cookies to track pages visited, actions taken, browser/device data, IP
            address, and cookie identifiers.
          </li>
          <li>
            <strong>Google Ads (via gtag.js):</strong> Used for conversion tracking and remarketing.
            It sets cookies to track pages visited, conversion events, browser/device data, IP
            address, and cookie identifiers.
          </li>
          <li>
            <strong>Reddit Pixel:</strong> Used for Reddit Ads attribution and conversion
            measurement. It sets cookies to track pages visited, conversion events, browser/device
            data, IP address, and cookie identifiers.
          </li>
          <li>
            <strong>X Pixel:</strong> Used for X Ads attribution and conversion measurement. It sets
            cookies to track pages visited, conversion events, browser/device data, IP address, and
            cookie identifiers.
          </li>
        </ul>
        <p>
          If you decline (or, in the EEA, the UK or Switzerland, ignore) the cookie consent banner,
          these cookies are never set, no data is sent to advertising platforms, and your use of
          OpenDocs remains entirely unaffected.
        </p>

        <h3>3.3. Cookie Consent Mechanism</h3>
        <p>
          On your first visit from the European Economic Area, the United Kingdom or Switzerland, a
          cookie consent banner is displayed, and marketing cookies require your explicit, unbundled
          opt-in. We determine this from your device&apos;s time zone setting, without looking up
          your IP address; if your time zone can&apos;t be read, we show the banner. Outside these
          regions, marketing cookies load by default, and we treat a Global Privacy Control signal
          from your browser as an opt-out. Strictly necessary cookies are always active. Your
          preference is stored in a cookie for 12 months so you are not prompted repeatedly. You can
          withdraw your consent or change your preferences at any time with the &ldquo;Cookie
          settings&rdquo; link in the footer of our website.
        </p>
      </LegalSection>

      <LegalSection id="storage" title="Data Storage and International Transfers">
        <p>
          Your personal data is primarily stored and processed within the European Economic Area
          (EEA) and the United Kingdom (UK).
        </p>
        <ul>
          <li>
            <strong>Primary Database:</strong> Hosted on Neon, running on AWS EU-West-2 (London, UK).
            The UK benefits from an adequacy decision issued by the European Commission, meaning data
            transfers from the EEA to the UK are legally permitted without requiring additional
            safeguards.
          </li>
          <li>
            <strong>Application Hosting:</strong> Our application servers, including the service
            that converts documents to PDF and Word files, run on Google Cloud in the europe-west2
            region (London, UK). Encrypted disk snapshots of these servers are kept for 14 days for
            disaster recovery.
          </li>
          <li>
            <strong>File Storage:</strong> Images you upload with documents and workspace logos are
            stored in Cloudflare R2 and served from assets.opendocs.cc.
          </li>
          <li>
            <strong>International Transfers:</strong> Where we utilize sub-processors located outside
            the EEA or adequate jurisdictions (such as the United States), we rely on valid transfer
            mechanisms under Chapter V of the GDPR. This includes the EU-U.S. Data Privacy Framework
            (DPF) for certified organizations and standard contractual clauses (SCCs) approved by the
            European Commission.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="sub-processors" title="Sub-Processors">
        <p>
          To provide our service, we share necessary data with authorized third-party service
          providers (sub-processors). We have executed Data Processing Agreements (DPAs) with all
          sub-processors to ensure your data remains protected.
        </p>
        <table>
          <thead>
            <tr>
              <th>Sub-processor</th>
              <th>Purpose</th>
              <th>Data processed</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Neon (Neon Inc.)</td>
              <td>Database hosting</td>
              <td>All account data, user content, workspace data</td>
              <td>AWS EU-West-2, London, UK</td>
            </tr>
            <tr>
              <td>Paddle (Paddle.com Market Ltd)</td>
              <td>Payment processing (Merchant of Record)</td>
              <td>Billing data, email, country, transaction details</td>
              <td>UK/EU</td>
            </tr>
            <tr>
              <td>Plausible (Plausible Insights O&Uuml;)</td>
              <td>Privacy-focused analytics</td>
              <td>Aggregated page views, no personal data</td>
              <td>EU (Estonia)</td>
            </tr>
            <tr>
              <td>Sentry (Functional Software Inc.)</td>
              <td>Error tracking</td>
              <td>IP address, browser info, error stack traces</td>
              <td>EU data region</td>
            </tr>
            <tr>
              <td>Resend (Resend Inc.)</td>
              <td>Transactional email delivery</td>
              <td>Email address, email content</td>
              <td>US (SCCs in place)</td>
            </tr>
            <tr>
              <td>Cloudflare (Cloudflare Inc.)</td>
              <td>CDN, DNS, DDoS protection, file storage (R2)</td>
              <td>IP address, request metadata, uploaded images and logos</td>
              <td>Global edge (DPF + SCCs)</td>
            </tr>
            <tr>
              <td>Google Cloud (Google Cloud EMEA Ltd.)</td>
              <td>Application server hosting and document conversion</td>
              <td>All data in transit and processed on the server, encrypted disk snapshots</td>
              <td>London, UK (europe-west2)</td>
            </tr>
            <tr>
              <td>Meta Platforms (Meta Platforms Inc.)</td>
              <td>Advertising measurement (only with consent)</td>
              <td>Cookie identifiers, browsing activity, IP address</td>
              <td>US (DPF + SCCs)</td>
            </tr>
            <tr>
              <td>Google (Google LLC)</td>
              <td>Advertising measurement (only with consent)</td>
              <td>Cookie identifiers, browsing activity, IP address</td>
              <td>US (DPF + SCCs)</td>
            </tr>
            <tr>
              <td>Reddit (Reddit, Inc.)</td>
              <td>Advertising measurement (only with consent)</td>
              <td>Cookie identifiers, browsing activity, IP address</td>
              <td>US (DPF + SCCs)</td>
            </tr>
            <tr>
              <td>X Corp.</td>
              <td>Advertising measurement (only with consent)</td>
              <td>Cookie identifiers, browsing activity, IP address</td>
              <td>US (SCCs)</td>
            </tr>
            <tr>
              <td>MailerLite (UAB MailerLite)</td>
              <td>Marketing emails (only with opt-in)</td>
              <td>Email address, name</td>
              <td>EU (Lithuania)</td>
            </tr>
          </tbody>
        </table>
        <p>
          Integrations you choose to connect, such as Google Drive and DocuSeal, are not
          sub-processors: you use them under your own agreements with those providers, and we
          exchange data with them only on your instructions. Sections 2.8, 2.9 and 6 describe what
          we share with them.
        </p>
      </LegalSection>

      <LegalSection id="google-user-data" title="Google User Data">
        <p>
          This section explains how OpenDocs accesses, uses, stores, shares and deletes data we
          receive from Google when you sign in with Google or connect Google Drive.
        </p>

        <h3>6.1. Data We Access</h3>
        <ul>
          <li>
            <strong>Sign in with Google:</strong> your name, email address, profile picture and
            Google account ID, used only to create your account and sign you in.
          </li>
          <li>
            <strong>Google Drive:</strong> when a workspace owner or admin connects Google Drive, we
            receive the Google account&apos;s email address and account ID, and access to Drive
            with the <code>drive.file</code> permission only. This lets OpenDocs see and change
            just the files it creates and the folders you choose in Google&apos;s file picker. We
            cannot see, list or open any other files in your Drive.
          </li>
        </ul>

        <h3>6.2. How We Use It</h3>
        <p>
          We use Google Drive access only to save the documents that you, your teammates or your
          agents ask to save (as PDF, Word or Markdown files) into the folders your workspace
          picked, to show those folders&apos; names in your dashboard, and to confirm each saved
          file arrived intact. For each saved file we record its name, Drive file ID, link, size and
          checksum, who saved it and when. We show the connected Google account&apos;s email
          address so your workspace knows which account is in use.
        </p>

        <h3>6.3. Sharing</h3>
        <p>
          We do not sell Google user data, use it for advertising, or share it with anyone, except
          as needed to provide the features described above, to comply with the law, or as part of a
          merger, acquisition or sale of assets with notice to you. We do not use Google user data
          to develop, improve or train generalized artificial intelligence or machine learning
          models. Our staff do not read it unless you ask us to (for example, for support), it is
          needed for security purposes such as investigating abuse, or the law requires it.
        </p>

        <h3>6.4. Storage and Protection</h3>
        <p>
          The access token Google gives us is encrypted at rest with AES-256-GCM, using a key kept
          separately from our database, and is never shown to you or other users. It is stored with
          the rest of your workspace data in London, UK (see Section 4).
        </p>

        <h3>6.5. Retention and Deletion</h3>
        <p>
          An owner or admin can disconnect Google Drive at any time from the Integrations page in
          the dashboard. Disconnecting revokes our access with Google straight away and deletes the
          stored token and the list of chosen folders. You can also remove OpenDocs from your Google
          account at{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
            myaccount.google.com/permissions
          </a>
          . Files we saved to Drive stay in your Drive. The record of each save is kept in the
          workspace&apos;s history until the workspace or your account is deleted.
        </p>

        <h3>6.6. Limited Use</h3>
        <p>
          OpenDocs&apos; use and transfer to any other app of information received from Google APIs
          will adhere to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </LegalSection>

      <LegalSection id="browser-extension" title="OpenDocs Browser Extension">
        <p>
          The OpenDocs browser extension lets you publish an answer or a conversation from ChatGPT
          (chatgpt.com), Claude (claude.ai) or Gemini (gemini.google.com) as an OpenDocs document. This
          section explains what it accesses and what we do with it.
        </p>
        <p>
          <strong>What it reads, and when.</strong> The extension runs only on those three sites. It
          reads a conversation only when you click Publish, and only the conversation open in that tab:
          the text of the answer or conversation you chose, its title and, if you are signed in, the
          images in it. It reads the conversation in your browser using your existing session on the
          chat site. Your credentials for the chat site never leave your browser and are never sent to
          us.
        </p>
        <p>
          <strong>What it sends to us.</strong> When you click Publish, the extension sends that content
          to OpenDocs to create your document, and nothing else. Without an account, it becomes an
          anonymous document: anyone with its link can read it for 24 hours, after which it is deleted
          unless you claim it into a workspace. When you are signed in, it becomes a document in your
          workspace and is handled like any other document under this policy.
        </p>
        <p>
          <strong>What it stores in your browser.</strong> Your settings, the sign-in tokens OpenDocs
          issues to the extension, the claim tokens of anonymous documents you published (so you can
          keep them by signing in), and a list of your 20 most recent publishes (title, link, the chat
          site and the identifiers needed to update the same document later). It does not store copies
          of your conversations.
        </p>
        <p>
          <strong>Error reports.</strong> If the extension cannot read a conversation, it sends us a
          short report with the chat site, the step that failed, an error code and the extension&apos;s
          version. Reports never contain conversation content, and we use them only to find and fix
          problems.
        </p>
        <p>
          <strong>Signing in.</strong> Signing in uses the OpenDocs sign-in page and allows the extension
          to read and create documents in your account. You can disconnect it at any time in Dashboard
          → Connected apps, which ends its access.
        </p>
        <p>
          <strong>Limited Use.</strong> The use of information received through the extension adheres to
          the{" "}
          <a href="https://developer.chrome.com/docs/webstore/program-policies/user-data-faq">
            Chrome Web Store User Data Policy
          </a>
          , including the Limited Use requirements. We use it only to publish the content you choose as
          an OpenDocs document. We do not sell it, use it for advertising or use it to determine
          creditworthiness, and no person reads it except with your permission, for security purposes,
          to comply with the law, or as part of the service you asked for (for example, a document you
          shared).
        </p>
        <p>
          The extension&apos;s source code is public at{" "}
          <a href="https://github.com/opendocs-cc/opendocs-extension">
            github.com/opendocs-cc/opendocs-extension
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="retention" title="Data Retention">
        <p>
          We retain personal data only for as long as necessary to fulfill the purposes outlined in
          this policy or as legally required.
        </p>
        <ul>
          <li>
            <strong>Account Data and User Content:</strong> Retained while your account is active.
            Upon an account deletion request or individual document deletion, data is removed from
            our primary databases within 30 days. Backup copies may persist in encrypted archives for
            up to 30 additional days before being permanently purged.
          </li>
          <li>
            <strong>Billing/Financial Records:</strong> Retained for 7 years following the end of the
            financial year in which the transaction occurred, as mandated by the Icelandic Accounting
            Act (l&ouml;g um b&oacute;khald nr. 145/1994, Art. 20). This retention is limited to
            necessary financial records; your personal account profile, documents, and API keys are
            still deleted within the 30-day window upon account closure.
          </li>
          <li>
            <strong>Integrations:</strong> Stored credentials for Google Drive and DocuSeal are
            deleted as soon as an owner or admin disconnects the integration. Records of saved files
            and signature requests (including signers&apos; names and email addresses) are kept with
            the workspace until the workspace or account is deleted.
          </li>
          <li>
            <strong>Server Logs and Sentry Error Data:</strong> Automatically deleted after 90 days.
          </li>
          <li>
            <strong>Analytics (Plausible):</strong> Only aggregated, non-personal data is retained.
          </li>
          <li>
            <strong>Cookie Preferences:</strong> Your consent status is stored in your browser for 12
            months.
          </li>
          <li>
            <strong>Marketing Cookies:</strong> Retention is controlled by Meta or Google. You can
            clear these from your browser at any time.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="rights" title="Your Privacy Rights">
        <p>
          Under the GDPR (Chapter III), you possess comprehensive rights regarding your personal
          data. You may exercise any of these rights by contacting us at{" "}
          <a href="mailto:hello@opendocs.cc">hello@opendocs.cc</a>. We will respond to your request
          within 30 days. For complex requests, we may extend this period by up to 60 additional
          days, provided we inform you of the extension within the initial 30 days.
        </p>
        <ol>
          <li>
            <strong>Right of Access (Art. 15):</strong> You have the right to request a copy of all
            personal data we hold about you.
          </li>
          <li>
            <strong>Right to Rectification (Art. 16):</strong> You have the right to correct
            inaccurate or incomplete data. You can update most of your profile data directly in the
            OpenDocs dashboard.
          </li>
          <li>
            <strong>Right to Erasure / &quot;Right to be Forgotten&quot; (Art. 17):</strong> You can
            request the deletion of your account and all associated data. You can initiate this
            self-serve from your dashboard. Deletion is completed within 30 days, subject to the
            financial record retention required by Icelandic law.
          </li>
          <li>
            <strong>Right to Restriction of Processing (Art. 18):</strong> You may ask us to suspend
            the processing of your personal data under certain circumstances (e.g., if you contest
            its accuracy).
          </li>
          <li>
            <strong>Right to Data Portability (Art. 20):</strong> You may receive your data in a
            structured, commonly used, and machine-readable format. You can export your published
            documents at any time using our CLI (<code>opendocs pull</code>).
          </li>
          <li>
            <strong>Right to Object (Art. 21):</strong> You have the right to object to processing
            based on our legitimate interests. If you object, we will cease processing unless we
            demonstrate compelling legitimate grounds that override your rights.
          </li>
          <li>
            <strong>Right to Withdraw Consent (Art. 7(3)):</strong> Where processing is based on
            your consent (such as for marketing cookies or our newsletter), you may withdraw it at
            any time. Withdrawal does not affect the lawfulness of processing that occurred
            beforehand.
          </li>
          <li>
            <strong>Right to Lodge a Complaint (Art. 77):</strong> If you believe our processing
            violates data protection laws, you have the right to lodge a complaint with the Icelandic
            Data Protection Authority (Pers&oacute;nuvernd, Rau&eth;ar&aacute;rst&iacute;gur 10,
            105 Reykjav&iacute;k, Iceland;{" "}
            <a href="https://www.personuvernd.is" target="_blank" rel="noopener noreferrer">
              www.personuvernd.is
            </a>
            ), or with your local supervisory authority within the EEA.
          </li>
        </ol>
      </LegalSection>

      <LegalSection id="children" title="Children's Privacy">
        <p>
          OpenDocs is a professional productivity tool and is not directed at or intended for
          children. We do not knowingly collect personal data from individuals under the age of 16.
          If we become aware that we have collected personal data from a child under 16 without
          appropriate parental consent, we will take immediate steps to delete that information.
        </p>
      </LegalSection>

      <LegalSection id="marketing" title="Marketing Communications">
        <p>
          We solely send transactional emails necessary for the operation of the service (e.g.,
          account verification, password resets, security alerts). We also offer an optional marketing
          newsletter delivered via MailerLite. You will only receive this newsletter if you explicitly
          opt-in. You can withdraw your consent and unsubscribe at any time by clicking the
          &quot;unsubscribe&quot; link provided at the bottom of every marketing email.
        </p>
      </LegalSection>

      <LegalSection id="automated" title="Automated Decision-Making">
        <p>
          We do not engage in automated decision-making or profiling that produces legal effects
          concerning you or similarly significantly affects you, as defined under Article 22 of the
          GDPR.
        </p>
      </LegalSection>

      <LegalSection id="security" title="Security Measures">
        <p>
          Protecting your data is a core priority. We implement robust technical and organizational
          measures, including:
        </p>
        <ul>
          <li>TLS encryption for all data in transit.</li>
          <li>Encryption at rest for our primary databases.</li>
          <li>
            Hashing of passwords (using bcrypt) and API keys (we cannot reverse the hash to see your
            key).
          </li>
          <li>
            Encryption of integration credentials (Google Drive tokens and DocuSeal API keys) with
            AES-256-GCM, using a key kept separately from the database.
          </li>
          <li>Network firewall rules and strict access controls.</li>
          <li>Regular security updates and patch management.</li>
        </ul>
        <p>
          While we strive to use commercially acceptable means to protect your personal data, no
          method of transmission over the Internet or method of electronic storage is 100% secure,
          and we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection id="third-party" title="Third-Party Links">
        <p>
          The OpenDocs service, or documents published by our users, may contain links to third-party
          websites. We are not responsible for the privacy practices, content, or security of those
          external websites. We encourage you to read the privacy policies of any third-party sites
          you visit.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this Privacy Policy">
        <p>
          We may update this Privacy Policy periodically to reflect changes in our practices,
          technology, or legal requirements. If we make material changes, we will provide you with
          prominent notice, such as via email or a notification in the OpenDocs dashboard, at least
          30 days before the changes take effect. Your continued use of the service after the
          effective date constitutes acknowledgment of the updated policy.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact Information">
        <p>
          If you have any questions, concerns, or wish to exercise your privacy rights, please
          contact us at:{" "}
          <a href="mailto:hello@opendocs.cc">hello@opendocs.cc</a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
