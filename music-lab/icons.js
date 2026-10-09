const PATHS = {
  play: '<path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.5-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2.2" fill="currentColor" stroke="none"/>',
  rec: '<circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="none"/>',
  metro: '<path d="M9.2 3.5h5.6l4 17H5.2z"/><path d="m12 16 5.2-9.6"/><circle cx="17.7" cy="5.5" r="1.3" fill="currentColor"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="m6 7 1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/><path d="M9 7V4.5h6V7"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  newfile: '<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5"/><path d="M12 11.5v6M9 14.5h6"/>',
  duplicate: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  piano: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14M8 13.5V19M16 13.5V19"/><rect x="6.5" y="5" width="3" height="8.5" rx=".6" fill="currentColor" stroke="none"/><rect x="14.5" y="5" width="3" height="8.5" rx=".6" fill="currentColor" stroke="none"/>',
  guitar: '<path d="m13.8 10.2 6-6"/><path d="m18.3 2.7 3 3"/><path d="M10.6 8.2c-1.6-.4-3.4.1-4.6 1.3-1 1-1.2 2.3-.9 3.3-1.3.4-2.3 1.6-2.3 3.1 0 2.2 1.9 4 4.2 3.9 1.3 0 2.3-.9 2.8-2 1 .3 2.3.1 3.3-.9 1.2-1.2 1.7-3 1.3-4.6"/><circle cx="10.2" cy="13.8" r="1.4"/>',
  bass: '<path d="M2.5 12c1.6 0 2.4-7 4.75-7S9.6 19 12 19s2.4-14 4.75-14S19.9 12 21.5 12"/>',
  synth: '<path d="M3 16.5 9 7.5v9l6-9v9l6-9"/>',
  pad: '<path d="M3 10c3-4 6-4 9 0s6 4 9 0"/><path d="M3 15c3-4 6-4 9 0s6 4 9 0" opacity=".45"/>',
  bells: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5z"/><path d="M10.5 20.5a1.6 1.6 0 0 0 3 0"/><path d="M12 3.5v2"/>',
  organ: '<rect x="4" y="10" width="3" height="10" rx="1.5"/><rect x="8.5" y="5" width="3" height="15" rx="1.5"/><rect x="13" y="7.5" width="3" height="12.5" rx="1.5"/><rect x="17.5" y="11" width="3" height="9" rx="1.5"/>',
  drums: '<ellipse cx="12" cy="11" rx="8" ry="3"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/><path d="M9.5 10 5 3.5M14.5 10 19 3.5"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}
