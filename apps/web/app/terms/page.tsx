import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { endSentence, legalEntity, legalEntityWithRegistration } from "@/lib/legal-entity";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata = buildPageMetadata({
  title: "Terms of Service",
  description:
    "The legal terms governing your use of OpenDocs — account rules, subscriptions, user content, and acceptable use.",
  url: "https://opendocs.cc/terms",
});

// The operator's details come from the environment at request time.
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const entity = legalEntity();
  return (
    <LegalPage
      document="terms"
      title="Terms of Service"
      summary={`The agreement between you and ${entity.name} that covers your OpenDocs account, plans and billing, your content, and acceptable use.`}
      effective="April 14, 2026"
      updated="October 25, 2026"
    >
      <p>
        These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between
        you (&quot;you,&quot; &quot;your,&quot; or &quot;User&quot;) and{" "}
        {legalEntityWithRegistration(entity)}
        {entity.country ? `, a company incorporated under the laws of ${entity.country}` : ""}, doing
        business as OpenDocs (&quot;OpenDocs,&quot; &quot;we,&quot; &quot;us,&quot;
        or &quot;our&quot;). These Terms govern your access to and use of the OpenDocs website
        (https://opendocs.cc), command-line interface (&quot;CLI&quot;), application programming
        interface (&quot;API&quot;), and any related services (collectively, the
        &quot;Service&quot;).
      </p>

      <LegalSection id="acceptance-of-terms" title="Acceptance of Terms">
        <p>
          1.1. By accessing, registering for, or using the Service, you agree to be bound by these
          Terms and our <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          1.2. If you are entering into these Terms on behalf of a company or other legal entity, you
          represent that you have the authority to bind such entity to these Terms. If you do not
          agree to these Terms, or if you do not have such authority, you must not accept these Terms
          and may not use the Service.
        </p>
      </LegalSection>

      <LegalSection id="description-of-service" title="Description of Service">
        <p>
          2.1. OpenDocs is a Markdown publishing platform that allows users to write, manage, and
          publish Markdown files.
        </p>
        <p>2.2. The Service consists of:</p>
        <ul>
          <li>
            The OpenDocs Website, which includes landing pages, user authentication, a dashboard for
            document management, and public profile pages.
          </li>
          <li>
            The OpenDocs CLI tool (distributed via npm), which provides a command-line interface for
            publishing, updating, pulling, and managing documents.
          </li>
          <li>
            The OpenDocs REST API, which provides programmatic backend access for authentication,
            publishing, and account management.
          </li>
          <li>
            Anonymous sharing, which lets anyone publish a document without an account to a link
            that is deleted after 24 hours unless it is claimed into an account.
          </li>
          <li>
            Optional integrations, available on paid plans, that connect a workspace to third-party
            services such as Google Drive (for saving exported documents) and DocuSeal (for
            electronic signatures).
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="eligibility" title="Eligibility">
        <p>
          3.1. The Service is provided as a professional productivity tool. By using the Service, you
          represent and warrant that you have the legal capacity to form a binding contract under
          applicable law.
        </p>
        <p>
          3.2. We do not place specific age restrictions on the use of the Service; however, if you
          are a minor under the laws of your jurisdiction, you must have the permission of a parent
          or legal guardian to use the Service.
        </p>
      </LegalSection>

      <LegalSection id="account-registration-and-security" title="Account Registration and Security">
        <p>
          4.1. To use certain features of the Service, you must register for an account using an
          email address and password, a one-time code sent to your email address, or a supported
          third-party authentication provider (e.g., GitHub, Google OAuth).
        </p>
        <p>
          4.2. You agree to provide accurate, current, and complete information during registration
          and to keep your account information updated.
        </p>
        <p>4.3. You are permitted to register only one individual account per person.</p>
        <p>
          4.4. You are solely responsible for safeguarding your account credentials, including your
          password and any API keys generated through your account. You agree not to disclose these
          credentials to any third party and to notify us immediately of any unauthorized use of your
          account.
        </p>
        <p>
          4.5. Each user selects or is assigned a unique username. This username is used in public
          profile URLs and document routing. We reserve the right to reclaim, reassign, or modify
          usernames in cases of trademark infringement, impersonation, or prolonged inactivity.
        </p>
      </LegalSection>

      <LegalSection id="subscription-plans-and-billing" title="Subscription Plans and Billing">
        <p>5.1. OpenDocs offers Free, Pro, and Team subscription plans.</p>
        <ul>
          <li>
            The <strong>Free</strong> plan includes one workspace with up to 50 published documents
            and up to 3 members (with owner, admin, and member roles, which every plan includes),
            workspace-visible and public documents, and PDF export with your own export branding
            (logo, brand color, font, and branding presets). Documents exported on the Free plan
            always carry a &quot;Made with OpenDocs&quot; footer.
          </li>
          <li>
            The <strong>Pro</strong> plan is a personal subscription billed per user. It includes
            unlimited published documents, up to 5 workspace members per workspace across up to 2
            workspaces (additional workspaces are available as a paid add-on), public publishing,
            custom profiles, a custom export footer (or none), Word (.docx) export, integrations,
            a custom domain for each workspace, and email support.
          </li>
          <li>
            The <strong>Team</strong> plan is an account-scoped subscription billed per seat
            (per unique team member), with a minimum of three (3) seats. It includes everything in Pro, plus
            unlimited workspaces and unlimited members per workspace (subject to your purchased
            seat count), and priority support.
          </li>
        </ul>
        <p>
          5.2. <strong>Merchant of Record.</strong> All payments for the Service are processed and
          managed by our Merchant of Record, Paddle. When you purchase a Pro or Team plan, your
          payment and billing relationship is directly with Paddle, and Paddle&apos;s terms of
          service and privacy policy will apply to payment processing, invoicing, tax collection,
          and refunds. You do not maintain a direct billing relationship with{" "}
          {endSentence(entity.name)}
        </p>
        <p>
          5.3. <strong>Upgrades, Downgrades, and Cancellations.</strong> You may cancel your
          subscription at any time. Upon cancellation, your paid features (Pro or Team) will
          remain active until the end of your current paid billing period, after which your
          account or workspace will revert to the Free plan.
        </p>
        <p>
          5.4. <strong>Team Seats, Add-ons, and Proration.</strong> On the Team plan, you are
          billed for each unique active member across the workspaces you own, subject to the
          three-seat minimum. When a member joins a workspace, a seat is added and a prorated
          charge applies for the remainder of the current billing period; when a member leaves or
          is removed, the seat is removed and the unused time is credited on a prorated basis. On
          the Pro plan, additional workspaces are billed the same way: adding one results in a
          prorated charge, and deleting one ends its charge with the unused time credited. The
          Team plan is billed and managed at the account level; seat counts and billing are
          administered by the subscribing account owner.
        </p>
        <p>
          5.5. <strong>Downgrade Limitations.</strong> When your account or workspace reverts from
          a paid plan (Pro or Team) to Free — whether by cancellation, non-payment, or
          subscription expiration — features exclusive to the paid plan (such as unlimited
          documents, Word export, the custom export footer, integrations, and custom domains)
          will be disabled, and exports will again carry the &quot;Made with
          OpenDocs&quot; footer. A connected custom domain is kept but paused, and its links
          redirect to the documents on opendocs.cc until you upgrade again. Your logo, brand color, and font settings are kept. If your
          workspace exceeds the Free plan limit
          of 50 published documents, all existing documents will remain live, accessible, and
          readable; however, you will be blocked from publishing new documents until either you
          delete existing documents to fall below the Free plan limit, or you upgrade back to a
          paid plan. If your workspace exceeds the Free plan member limit, no members are
          automatically removed, but new invitations will be blocked. No documents or memberships
          are automatically deleted by us upon account or workspace downgrade.
        </p>
      </LegalSection>

      <LegalSection id="user-content-and-intellectual-property" title="User Content and Intellectual Property">
        <p>
          6.1. <strong>Ownership.</strong> You retain full ownership of all text, images, Markdown
          files, and other materials you upload, publish, or otherwise transmit through the Service
          (&quot;User Content&quot;). OpenDocs claims no ownership over your User Content.
        </p>
        <p>
          6.2. <strong>License Grant.</strong> By publishing User Content on OpenDocs, you grant{" "}
          {entity.name} a non-exclusive, worldwide, royalty-free, and sublicensable license
          to host, store, display, reproduce, cache, and distribute your User Content strictly for
          the purpose of operating, providing, maintaining, and improving the Service.
        </p>
        <p>
          6.3. <strong>Termination of License.</strong> The license granted in Section 6.2 exists
          only for as long as your User Content remains on the platform. You may delete your User
          Content at any time. Upon deletion, this license terminates automatically, subject to
          reasonable delays required to remove the content from our caching systems and routine
          system backups.
        </p>
        <p>
          6.4. <strong>Responsibility.</strong> You are solely responsible for the User Content you
          publish. You represent and warrant that you have all necessary rights, licenses, and
          permissions to publish the User Content and grant the license outlined above, and that your
          User Content does not infringe the intellectual property or privacy rights of any third
          party.
        </p>
        <p>
          6.5. <strong>Visibility.</strong> Documents published as &quot;public&quot; are accessible
          to anyone on the internet who has the link. Documents published as
          &quot;workspace-visible&quot; are restricted and accessible only to authorized members of
          your OpenDocs workspace. &quot;Private&quot; documents are accessible only to you, and
          documents you share with specific email addresses or domains are also accessible to
          those people. Documents published anonymously, without an account, are accessible to
          anyone who has the link until they are deleted after 24 hours or claimed into an
          account.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use-policy" title="Acceptable Use Policy">
        <p>7.1. You agree not to use the Service to:</p>
        <ul>
          <li>
            Publish, host, or transmit any unlawful, discriminatory, defamatory, or obscene content.
          </li>
          <li>Distribute malware, viruses, trojans, or any other malicious code.</li>
          <li>Transmit spam, phishing materials, or unsolicited promotional content.</li>
          <li>Harass, abuse, threaten, or impersonate any person or entity.</li>
          <li>
            Scrape, crawl, or aggressively poll the Service beyond reasonable human or standard API
            use.
          </li>
          <li>
            Circumvent, bypass, or attempt to bypass any rate limits, security measures, or access
            controls.
          </li>
          <li>
            Reverse engineer, decompile, or disassemble any portion of the hosted Service.
          </li>
          <li>Use the Service for the purpose of building a competing product or service.</li>
        </ul>
        <p>
          7.2. We reserve the right, but have no obligation, to review, hide, or remove any User
          Content that we determine in our sole discretion violates these Terms or is otherwise
          objectionable, with or without prior notice.
        </p>
      </LegalSection>

      <LegalSection id="api-cli-and-integrations" title="API, CLI, and Integrations">
        <p>
          8.1. Access to the OpenDocs API and CLI requires valid authentication, typically via API
          keys generated in your account dashboard.
        </p>
        <p>
          8.2. You are fully responsible for all actions taken under your API keys. If an API key is
          compromised, you must revoke it immediately through your dashboard.
        </p>
        <p>
          8.3. Programmatic usage of the API and CLI is subject to rate limits to ensure platform
          stability. We reserve the right to throttle, suspend, or terminate programmatic access if
          your usage negatively impacts the Service or other users, or violates the automated usage
          policies defined in our documentation.
        </p>
        <p>
          8.4. <strong>Integrations.</strong> When a workspace owner or admin connects a
          third-party service to a workspace (for example, Google Drive or DocuSeal), they
          authorize us to access that service on the workspace&apos;s behalf, within the
          permissions granted, to carry out the actions members request, such as saving an
          exported document to a folder or sending a document for signature. An owner or admin can
          disconnect an integration at any time from the dashboard.
        </p>
        <p>
          8.5. Your use of a third-party service is governed by that provider&apos;s own terms and
          privacy policy. We are not responsible for the availability or conduct of third-party
          services, or for the legal validity of signatures collected through them.
        </p>
      </LegalSection>

      <LegalSection id="availability-and-uptime" title="Availability and Uptime">
        <p>
          9.1. The Service is provided on a &quot;best-effort&quot; basis. While we strive to
          maintain high availability, we do not guarantee any specific uptime, SLA, or uninterrupted
          access to the Service.
        </p>
        <p>
          9.2. Access to the Service may be occasionally suspended or restricted for scheduled
          maintenance, repairs, or the introduction of new features. We reserve the right to modify,
          suspend, or discontinue any part of the Service at any time, with or without notice.
        </p>
      </LegalSection>

      <LegalSection id="termination" title="Termination">
        <p>
          10.1. <strong>Termination by You.</strong> You may request complete deletion of your
          account at any time through your account dashboard or by contacting us. In compliance with
          the General Data Protection Regulation (GDPR), terminating your account will result in the
          permanent deletion of all your data, including published documents, profile information,
          and API keys.
        </p>
        <p>
          10.2. <strong>Termination by Us.</strong> We may suspend or terminate your access to the
          Service at any time, with or without notice, if we reasonably believe you have violated
          these Terms, our Acceptable Use Policy, or any applicable law.
        </p>
        <p>
          10.3. <strong>Effect of Termination.</strong> Upon termination of your account, your right
          to use the Service will immediately cease, and your User Content will be deleted from our
          active production systems.
        </p>
      </LegalSection>

      <LegalSection id="disclaimers-and-warranties" title="Disclaimers and Warranties">
        <p>
          11.1. The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis.
          To the maximum extent permitted by applicable law, {entity.name} expressly
          disclaims all warranties of any kind, whether express, implied, or statutory, including but
          not limited to the implied warranties of merchantability, fitness for a particular purpose,
          title, and non-infringement.
        </p>
        <p>
          11.2. We do not warrant that the Service will be uninterrupted, timely, secure, or
          error-free, nor do we make any warranty as to the accuracy or reliability of any
          information obtained through the Service.
        </p>
      </LegalSection>

      <LegalSection id="limitation-of-liability" title="Limitation of Liability">
        <p>
          12.1. To the maximum extent permitted by applicable law, in no event shall{" "}
          {entity.name}, its directors, employees, agents, or affiliates be liable for any indirect,
          incidental, special, consequential, or punitive damages, including but not limited to loss
          of profits, data, use, or goodwill, arising out of or in connection with your access to or
          use of (or inability to use) the Service.
        </p>
        <p>
          12.2. In no event shall our aggregate liability arising out of or relating to these Terms
          exceed the amount you paid to Paddle for the Service in the twelve (12) months preceding
          the claim.
        </p>
        <p>
          12.3. <strong>Statutory Exceptions.</strong> Nothing in these Terms shall limit or exclude
          our liability for death or personal injury caused by our negligence, or for gross
          negligence, willful misconduct, fraud, or any other liability that cannot be excluded or
          limited under Icelandic law or applicable European Union consumer protection regulations.
        </p>
      </LegalSection>

      <LegalSection id="indemnification" title="Indemnification">
        <p>
          13.1. You agree to defend, indemnify, and hold harmless {entity.name} and its
          officers, directors, employees, and agents from and against any claims, liabilities,
          damages, losses, and expenses, including reasonable legal and accounting fees, arising out
          of or in any way connected with your access to or use of the Service, your User Content,
          or your violation of these Terms.
        </p>
      </LegalSection>

      <LegalSection id="changes-to-terms" title="Changes to Terms">
        <p>
          14.1. We reserve the right to modify these Terms at any time. If we make material changes
          to these Terms, we will notify you by sending an email to the address associated with your
          account or by posting a prominent notice on our website prior to the changes taking effect.
        </p>
        <p>
          14.2. Your continued use of the Service following the effective date of such modifications
          constitutes your acceptance of the revised Terms. If you do not agree to the updated
          Terms, your sole and exclusive remedy is to terminate your account and cease using the
          Service.
        </p>
      </LegalSection>

      <LegalSection id="governing-law-and-dispute-resolution" title="Governing Law and Dispute Resolution">
        <p>
          15.1. These Terms and any action related thereto shall be governed by and construed in
          accordance with the laws of Iceland, without regard to its conflict of law principles.
        </p>
        <p>
          15.2. Any dispute, claim, or controversy arising out of or relating to these Terms or the
          breach, termination, enforcement, interpretation, or validity thereof shall be subject to
          the exclusive jurisdiction of the courts of Reykjavik, Iceland.
        </p>
        <p>
          15.3. <strong>Consumer Rights.</strong> If you are accessing the Service as a consumer
          resident in the European Union or the European Economic Area, nothing in these Terms
          precludes you from bringing a claim in the courts of the country in which you reside, nor
          does it deprive you of the protection afforded to you by the mandatory provisions of the
          law of your country of residence.
        </p>
      </LegalSection>

      <LegalSection id="severability" title="Severability">
        <p>
          16.1. If any provision of these Terms is held to be invalid, illegal, or unenforceable by a
          court of competent jurisdiction, the remaining provisions of these Terms will remain in
          full force and effect.
        </p>
      </LegalSection>

      <LegalSection id="entire-agreement" title="Entire Agreement">
        <p>
          17.1. These Terms, together with our <Link href="/privacy">Privacy Policy</Link> and any
          other legal notices published by us on the Service, constitute the entire and exclusive
          agreement between you and {entity.name} regarding your use of the Service,
          superseding any prior agreements between you and us relating to the Service.
        </p>
      </LegalSection>

      <LegalSection id="assignment" title="Assignment">
        <p>
          18.1. You may not assign, transfer, or delegate these Terms or any of your rights or
          obligations hereunder without our prior written consent. We may freely assign these Terms
          or any rights or obligations hereunder, including in connection with a merger, acquisition,
          corporate reorganization, or sale of all or substantially all of our assets.
        </p>
      </LegalSection>

      <LegalSection id="waiver" title="Waiver">
        <p>
          19.1. Our failure or delay to exercise or enforce any right or provision of these Terms
          will not constitute a waiver of such right or provision. Any waiver of any provision of
          these Terms will be effective only if in writing and signed by an authorized representative
          of {endSentence(entity.name)}
        </p>
      </LegalSection>

      <LegalSection id="force-majeure" title="Force Majeure">
        <p>
          20.1. Neither party shall be liable for any failure or delay in the performance of its
          obligations under these Terms (except for payment obligations) arising out of or caused,
          directly or indirectly, by circumstances beyond its reasonable control, including but not
          limited to acts of God, earthquakes, fires, floods, wars, civil or military disturbances,
          acts of terrorism, sabotage, labor strikes, epidemics, pandemics, or interruptions, loss,
          or malfunctions of utilities, network, or communication services.
        </p>
      </LegalSection>

      <LegalSection id="contact-information" title="Contact Information">
        <p>
          21.1. If you have any questions, concerns, or notices regarding these Terms or the Service,
          please contact us at:{" "}
          <a href="mailto:hello@opendocs.cc">hello@opendocs.cc</a>
        </p>
      </LegalSection>

      <LegalSection id="cli-source-code" title="CLI Source Code">
        <p>
          22.1. The source code for the OpenDocs CLI is made publicly available under the MIT
          license on GitHub.
        </p>
        <p>
          22.2. The OpenDocs web application, API, document-conversion service, infrastructure, and
          non-CLI source code are proprietary unless we publish them under a separate license.
        </p>
        <p>
          22.3. The CLI&apos;s MIT license applies solely to the CLI source code itself. Your use of the
          hosted Service provided by {entity.name} at opendocs.cc (and its subdomains) is
          governed strictly by these Terms.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
