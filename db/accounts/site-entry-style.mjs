// Server-rendered Site entry pages share the editor palette, without editor globals.
export const siteEntryStyle = `
:root{color-scheme:light;--ink:#243247;--muted:#647084;--line:#dce2e9;--blue:#334f72;--canvas:#f4f6f8}
*{box-sizing:border-box}
body{margin:0;background:var(--canvas);color:var(--ink);font:15px/1.65 "Segoe UI","Microsoft YaHei",sans-serif}
a{color:var(--blue);text-underline-offset:4px}
a:focus-visible,summary:focus-visible{outline:3px solid #6d93c4;outline-offset:4px}
p,h1,h2{overflow-wrap:anywhere}
p{margin:0 0 16px}
h1,h2{line-height:1.3}
h1{font-size:clamp(28px,3.3vw,40px);letter-spacing:-.035em;margin:6px 0 8px}
.site-title{display:inline-block}
h2{font-size:22px;margin:0 0 10px}
.top{min-height:72px;background:#fff;border-bottom:1px solid var(--line)}
.top-inner{max-width:1184px;margin:auto;padding:14px 32px;min-height:72px;display:flex;justify-content:space-between;align-items:center;gap:20px}
.brand{font-weight:700;color:var(--ink);text-decoration:none;min-width:0}
.top a:last-child{font-size:13px;display:inline-flex;align-items:center;min-height:44px;white-space:nowrap}
main{max-width:1184px;margin:auto;padding:36px 32px 40px}
.eyebrow{font-size:10px;font-weight:600;letter-spacing:.13em;color:var(--muted);margin:0}
.workspace-heading{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:26px}
.workspace-heading>div{min-width:0}
.account-line{font-size:13px;color:var(--muted);margin:0}
.button{display:inline-flex;align-items:center;justify-content:center;gap:14px;min-height:44px;padding:10px 17px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--blue);font-weight:600;font-size:14px;line-height:1.5;text-decoration:none;transition:background .15s,border-color .15s}
.button:hover{background:#edf2f8;border-color:#b5c4d5}
.button.primary{background:var(--blue);border-color:var(--blue);color:#fff;padding-inline:22px}
.button.primary:hover{background:#243e5e;border-color:#243e5e}
.public-link{flex-shrink:0}
.publication-overview{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,.65fr);column-gap:48px;margin:0;padding:28px 32px;background:#fff;border:1px solid #cbd6e2;border-radius:14px;box-shadow:0 4px 16px rgb(36 50 71 / 3%)}
.overview-label{grid-column:1;display:flex;align-items:center;gap:12px;font-size:12px;color:var(--muted);margin-bottom:14px}
.status-pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;line-height:1.4;color:#326148;background:#edf5ef;padding:5px 9px;border-radius:5px}
.status-pill i{width:5px;height:5px;border-radius:50%;background:#4f8766}
.status-pill.neutral{color:#596679;background:#edf1f5}
.is-unknown{border-color:#cdbf9d}
.publication-overview h2{grid-column:1;font-size:28px;letter-spacing:-.025em;margin:0 0 8px}
.publication-overview>p{grid-column:1;font-size:13px;color:var(--muted);margin:0;max-width:42em}
.publication-overview .publication-meta{font-size:11px;color:#748092;margin-top:16px}
.publication-draft-entry{grid-column:2;grid-row:1/5;align-self:center;display:flex;flex-direction:column;align-items:flex-start;gap:12px}
[data-published-draft-unavailable]{padding-top:16px}
.spaces-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin:30px 0 14px}
.spaces-heading h2{font-size:20px;margin:4px 0 0;letter-spacing:-.02em}
.spaces-heading>p{font-size:12px;color:var(--muted);margin:0}
.spaces{border:1px solid var(--line);border-radius:14px;background:#fff;overflow:clip}
.space{display:grid;grid-template-columns:66px minmax(0,1fr) auto;align-items:center;gap:22px;min-width:0;padding:20px 24px}
.space+.space{border-top:1px solid var(--line)}
.space[data-current-public]{background:#f8fafc}
.space-copy{min-width:0}
.space-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:5px}
.space-number{font-size:10px;font-weight:600;letter-spacing:.06em;color:#738096}
.badge{font-size:10px;line-height:1.5;color:#4f6480;background:#edf2f7;padding:2px 7px;border-radius:4px}
.badge.muted{background:#f1f2f4;color:#747d8a}
.space h2{display:flex;align-items:center;flex-wrap:wrap;gap:10px;font-size:19px;letter-spacing:-.02em;margin:0 0 3px}
.space-copy>p{font-size:12px;color:var(--muted);margin:0;line-height:1.65}
.public-badge{font-size:10px;line-height:1.5;color:#426c54;background:#eaf3ed;padding:2px 7px;border-radius:4px;font-weight:500;letter-spacing:0}
.space-action{min-width:0}
.space-link{background:transparent;white-space:nowrap;min-width:150px;border-color:#dce4ed;font-size:13px}
.unavailable{display:block;font-size:12px;color:#727c8b;max-width:150px;line-height:1.6}
.space-visual{position:relative;height:66px;width:66px;background:#edf1f5;border:1px solid #e2e7ed;border-radius:7px;overflow:hidden}
.space-visual i{position:absolute;display:block;background:#a4b7cb}
.visual-basic i:nth-child(1){inset:12px 12px 38px;border-bottom:2px solid #f8fafc;background:#516b89}
.visual-basic i:nth-child(2){inset:28px 33px 12px 12px}
.visual-basic i:nth-child(3){inset:28px 12px 12px 36px;background:#c5d1de}
.visual-premium-polaroid{background:#e8edf3}
.visual-premium-polaroid i{width:25px;height:33px;border:3px solid #fff;border-bottom-width:8px;box-shadow:0 2px 4px #2b43621a}
.visual-premium-polaroid i:nth-child(1){left:9px;top:12px;transform:rotate(-13deg);background:#9bafc8}
.visual-premium-polaroid i:nth-child(2){right:9px;top:22px;transform:rotate(9deg);background:#7a94b4}
.visual-premium-polaroid i:nth-child(3){width:4px;height:4px;border:0;background:#6e8aaa;border-radius:50%;left:41px;top:11px}
.visual-premium-flow-gallery{background:#eaf0ec}
.visual-premium-flow-gallery i:nth-child(1){width:20px;height:42px;left:11px;top:-8px;background:#7e9e94}
.visual-premium-flow-gallery i:nth-child(2){width:20px;height:34px;left:11px;top:38px;background:#bccdc4}
.visual-premium-flow-gallery i:nth-child(3){width:20px;height:46px;right:11px;top:11px;background:#a3bbb2}
.explanation{margin-top:22px;border-bottom:1px solid var(--line);color:var(--muted);font-size:12px}
.explanation summary{display:flex;align-items:center;justify-content:space-between;gap:20px;list-style:none;cursor:pointer;min-height:48px;font-size:13px;font-weight:600;color:#4c5e75}
.explanation summary::-webkit-details-marker{display:none}
.explanation summary span{font-size:18px;font-weight:400}
.explanation[open] summary span{transform:rotate(45deg)}
.explanation>div{padding:2px 0 16px;max-width:78em}
.explanation p{margin:0 0 8px}
.explanation p:last-child{margin:0}
.message{max-width:720px;padding:28px;border:1px solid var(--line);border-radius:14px;background:#fff;margin-top:24px}
.message>p:last-child{margin-bottom:0}
footer{margin-top:18px;color:#788497;font-size:11px}
@media(max-width:760px){
 .publication-overview{column-gap:24px;grid-template-columns:minmax(0,1fr) minmax(220px,.7fr);padding:24px}
 .space{grid-template-columns:54px minmax(0,1fr) auto;gap:16px;padding:18px 20px}
 .space-visual{height:54px;width:54px}
 .space-number{display:none}
 .space-link{min-width:0;padding-inline:12px}
}
@media(max-width:560px){
 .top,.top-inner{min-height:64px}
 .top-inner{padding:10px 18px;gap:12px}
 .brand{font-size:13px}
 .top a:last-child{font-size:12px}
 main{padding:22px 16px 30px}
 h1{font-size:28px;margin:4px 0 6px}
 .workspace-heading{align-items:flex-start;gap:12px;flex-direction:column;margin-bottom:18px}
 .account-line{font-size:11px}
 .public-link{font-size:12px;padding:9px 13px;min-height:44px}
 .publication-overview{display:block;padding:21px 20px;border-radius:12px}
 .overview-label{font-size:11px;margin-bottom:10px}
 .publication-overview h2{font-size:25px}
 .publication-overview>p{font-size:13px}
 .publication-draft-entry{gap:10px;margin-top:18px}
 .publication-draft-entry>.button{width:100%;justify-content:space-between;font-size:14px;min-height:46px}
 .publication-overview .publication-meta{font-size:11px;margin-top:12px}
 .spaces-heading{margin:24px 0 12px;gap:10px}
 .spaces-heading h2{font-size:18px}
 .spaces-heading>p{font-size:11px;white-space:nowrap;text-align:right}
 .spaces{border-radius:12px}
 .space{grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:16px}
 .space-visual{display:none}
 .space-top{margin-bottom:5px}
 .space h2{font-size:18px;gap:7px}
 .space-copy>p{font-size:12px}
 .badge,.public-badge{font-size:10px}
 .space-link{min-height:44px;padding:9px 10px;gap:8px;font-size:12px}
 .unavailable{font-size:11px;max-width:6em}
 .explanation{margin-top:16px}
 .explanation summary{font-size:12px}
}
@media(prefers-reduced-motion:reduce){.button{transition:none}}
`;
