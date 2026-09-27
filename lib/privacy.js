// Edit this file to change the Privacy Policy shown by /privacy.
//
// Keep the structure simple:
// - title: main title
// - updated: date shown under the title
// - sections: policy sections in display order
//
// The policy text itself is intentionally NOT localized. The surrounding
// Telegram UI (buttons, deletion request label, etc.) stays localized.

export const PRIVACY_POLICY = {
  title: 'Rich Customize Privacy Policy',
  updated: 'September 27, 2026',

  sections: [
    {
      heading: 'Overview',
      body:
        'Rich Customize is a Telegram bot for creating, saving, previewing, and publishing Rich Messages. '
        + 'This policy explains what data the bot processes and why.',
    },
    {
      heading: 'Data we process',
      body:
        '• Telegram account information needed to identify your bot session, including your Telegram user ID, '
        + 'language, and, when Telegram provides them, your name and username.\n'
        + '• Usage information such as first and last activity times and interaction counts used for service statistics and abuse protection.\n'
        + '• Content you create or save in the editor, including Rich Message blocks, buttons, page titles, and reusable Telegram media identifiers.\n'
        + '• Editor session state needed to continue your current editing workflow.\n'
        + '• Chats, groups, or channels you choose for publishing, together with the minimum metadata needed to show and use those destinations.\n'
        + '• Technical and error information needed to diagnose failures. Secret tokens are redacted from bot error diagnostics.',
    },
    {
      heading: 'How we use the data',
      body:
        'We use this information only to operate Rich Customize, restore editor state, save and publish your content, '
        + 'protect the service from abuse, diagnose failures, and understand aggregate service usage.',
    },
    {
      heading: 'Data retention',
      body:
        'Temporary editor sessions expire after inactivity. Saved pages remain until you delete them or request their removal. '
        + 'Short-term operational minute statistics are periodically cleaned up. Recovery snapshots may contain saved-page data '
        + 'and are limited to the most recent snapshots; older snapshots are replaced as newer ones are created.',
    },
    {
      heading: 'Sharing and third parties',
      body:
        "We do not sell your personal data. Rich Customize runs through Telegram and Telegram Serverless, so Telegram processes "
        + "information required to deliver bot updates, messages, files, and platform services under Telegram's own terms and privacy practices. "
        + 'We do not use third-party advertising trackers in the Serverless bot.',
    },
    {
      heading: 'Your choices',
      body:
        'You can delete individual saved pages from the bot. You can also request deletion of data associated with your Telegram account '
        + 'by using the red deletion-request button in this Privacy Policy or by contacting technical support. '
        + 'A deletion request may require verification from the same Telegram account.',
    },
    {
      heading: 'Children',
      body:
        'Rich Customize is a general-purpose Telegram tool and is not designed to knowingly collect additional information from children. '
        + 'If a parent or guardian believes data should be removed, they can contact technical support.',
    },
    {
      heading: 'Policy changes',
      body:
        'This policy may be updated when Rich Customize changes how it processes data. '
        + 'The current version is the version presented by the bot.',
    },
    {
      heading: 'Contact',
      body:
        'Technical support: https://t.me/RichCustomize?direct\n'
        + 'Updates: https://t.me/RichCustomize',
    },
  ],
};
