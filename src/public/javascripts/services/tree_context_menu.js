import treeService from './tree.js';
import cloningService from './cloning.js';
import exportService from './export.js';
import messagingService from './messaging.js';
import protectedSessionService from './protected_session.js';
import treeChangesService from './branches.js';
import treeUtils from './tree_utils.js';
import branchPrefixDialog from '../dialogs/branch_prefix.js';
import infoService from "./info.js";
import treeCache from "./tree_cache.js";
import syncService from "./sync.js";

const $tree = $("#tree");

let clipboardIds = [];
let clipboardMode = null;

async function pasteAfter(node) {
    if (clipboardMode === 'cut') {
        const nodes = clipboardIds.map(nodeKey => treeUtils.getNodeByKey(nodeKey));

        await treeChangesService.moveAfterNode(nodes, node);

        clipboardIds = [];
        clipboardMode = null;
    }
    else if (clipboardMode === 'copy') {
        for (const noteId of clipboardIds) {
            await cloningService.cloneNoteAfter(noteId, node.data.branchId);
        }

        // copy will keep clipboardIds and clipboardMode so it's possible to paste into multiple places
    }
    else if (clipboardIds.length === 0) {
        // just do nothing
    }
    else {
        infoService.throwError("Unrecognized clipboard mode=" + clipboardMode);
    }
}

async function pasteInto(node) {
    if (clipboardMode === 'cut') {
        const nodes = clipboardIds.map(nodeKey => treeUtils.getNodeByKey(nodeKey));

        await treeChangesService.moveToNode(nodes, node);

        clipboardIds = [];
        clipboardMode = null;
    }
    else if (clipboardMode === 'copy') {
        for (const noteId of clipboardIds) {
            await cloningService.cloneNoteTo(noteId, node.data.noteId);
        }
        // copy will keep clipboardIds and clipboardMode so it's possible to paste into multiple places
    }
    else if (clipboardIds.length === 0) {
        // just do nothing
    }
    else {
        infoService.throwError("Unrecognized clipboard mode=" + mode);
    }
}

function copy(nodes) {
    clipboardIds = nodes.map(node => node.data.noteId);
    clipboardMode = 'copy';

    infoService.showMessage("Note(s) have been copied into clipboard.");
}

function cut(nodes) {
    clipboardIds = nodes.map(node => node.key);
    clipboardMode = 'cut';

    infoService.showMessage("Note(s) have been cut into clipboard.");
}

const contextMenuOptions = {
    delegate: "span.fancytree-title",
    autoFocus: true,
    menu: [
        {title: "Insert note here <kbd>Ctrl+O</kbd>", cmd: "insertNoteHere", uiIcon: "ui-icon-plus"},
        {title: "Insert child note <kbd>Ctrl+P</kbd>", cmd: "insertChildNote", uiIcon: "ui-icon-plus"},
        {title: "Delete <kbd>Ctrl+Del</kbd>", cmd: "delete", uiIcon: "ui-icon-trash"},
        {title: "----"},
        {title: "Edit branch prefix <kbd>F2</kbd>", cmd: "editBranchPrefix", uiIcon: "ui-icon-pencil"},
        {title: "----"},
        {title: "Protect subtree", cmd: "protectSubtree", uiIcon: "ui-icon-locked"},
        {title: "Unprotect subtree", cmd: "unprotectSubtree", uiIcon: "ui-icon-unlocked"},
        {title: "----"},
        {title: "Copy / clone <kbd>Ctrl+C</kbd>", cmd: "copy", uiIcon: "ui-icon-copy"},
        {title: "Cut <kbd>Ctrl+X</kbd>", cmd: "cut", uiIcon: "ui-icon-scissors"},
        {title: "Paste into <kbd>Ctrl+V</kbd>", cmd: "pasteInto", uiIcon: "ui-icon-clipboard"},
        {title: "Paste after", cmd: "pasteAfter", uiIcon: "ui-icon-clipboard"},
        {title: "----"},
        {title: "Export subtree", cmd: "exportSubtree", uiIcon: " ui-icon-arrowthick-1-ne", children: [
            {title: "Native&nbsp;Tar", cmd: "exportSubtreeToTar"},
            {title: "OPML", cmd: "exportSubtreeToOpml"},
            {title: "Markdown", cmd: "exportSubtreeToMarkdown"}
        ]},
        {title: "Import into note (tar, opml)", cmd: "importIntoNote", uiIcon: "ui-icon-arrowthick-1-sw"},
        {title: "----"},
        {title: "Collapse subtree <kbd>Alt+-</kbd>", cmd: "collapseSubtree", uiIcon: "ui-icon-minus"},
        {title: "Force note sync", cmd: "forceNoteSync", uiIcon: "ui-icon-refresh"},
        {title: "Sort alphabetically <kbd>Alt+S</kbd>", cmd: "sortAlphabetically", uiIcon: " ui-icon-arrowthick-2-n-s"}
    ],
    beforeOpen: async (event, ui) => {
        const node = $.ui.fancytree.getNode(ui.target);
        const branch = await treeCache.getBranch(node.data.branchId);
        const note = await treeCache.getNote(node.data.noteId);
        const parentNote = await treeCache.getNote(branch.parentNoteId);
        const isNotRoot = note.noteId !== 'root';

        // Modify menu entries depending on node status
        $tree.contextmenu("enableEntry", "insertNoteHere", isNotRoot && parentNote.type !== 'search');
        $tree.contextmenu("enableEntry", "insertChildNote", note.type !== 'search');
        $tree.contextmenu("enableEntry", "delete", isNotRoot && parentNote.type !== 'search');
        $tree.contextmenu("enableEntry", "copy", isNotRoot);
        $tree.contextmenu("enableEntry", "cut", isNotRoot);
        $tree.contextmenu("enableEntry", "pasteAfter", clipboardIds.length > 0 && isNotRoot && parentNote.type !== 'search');
        $tree.contextmenu("enableEntry", "pasteInto", clipboardIds.length > 0 && note.type !== 'search');
        $tree.contextmenu("enableEntry", "importIntoNote", note.type !== 'search');
        $tree.contextmenu("enableEntry", "exportSubtree", note.type !== 'search');
        $tree.contextmenu("enableEntry", "editBranchPrefix", isNotRoot && parentNote.type !== 'search');

        // Activate node on right-click
        node.setActive();
        // Disable tree keyboard handling
        ui.menu.prevKeyboard = node.tree.options.keyboard;
        node.tree.options.keyboard = false;
    },
    close: (event, ui) => {},
    select: (event, ui) => {
        const node = $.ui.fancytree.getNode(ui.target);

        if (ui.cmd === "insertNoteHere") {
            const parentNoteId = node.data.parentNoteId;
            const isProtected = treeUtils.getParentProtectedStatus(node);

            treeService.createNote(node, parentNoteId, 'after', isProtected);
        }
        else if (ui.cmd === "insertChildNote") {
            treeService.createNote(node, node.data.noteId, 'into');
        }
        else if (ui.cmd === "editBranchPrefix") {
            branchPrefixDialog.showDialog(node);
        }
        else if (ui.cmd === "protectSubtree") {
            protectedSessionService.protectSubtree(node.data.noteId, true);
        }
        else if (ui.cmd === "unprotectSubtree") {
            protectedSessionService.protectSubtree(node.data.noteId, false);
        }
        else if (ui.cmd === "copy") {
            copy(treeService.getSelectedNodes());
        }
        else if (ui.cmd === "cut") {
            cut(treeService.getSelectedNodes());
        }
        else if (ui.cmd === "pasteAfter") {
            pasteAfter(node);
        }
        else if (ui.cmd === "pasteInto") {
            pasteInto(node);
        }
        else if (ui.cmd === "delete") {
            treeChangesService.deleteNodes(treeService.getSelectedNodes(true));
        }
        else if (ui.cmd === "exportSubtreeToTar") {
            exportService.exportSubtree(node.data.branchId, 'tar');
        }
        else if (ui.cmd === "exportSubtreeToOpml") {
            exportService.exportSubtree(node.data.branchId, 'opml');
        }
        else if (ui.cmd === "exportSubtreeToMarkdown") {
            exportService.exportSubtree(node.data.branchId, 'markdown');
        }
        else if (ui.cmd === "importIntoNote") {
            exportService.importIntoNote(node.data.noteId);
        }
        else if (ui.cmd === "collapseSubtree") {
            treeService.collapseTree(node);
        }
        else if (ui.cmd === "forceNoteSync") {
            syncService.forceNoteSync(node.data.noteId);
        }
        else if (ui.cmd === "sortAlphabetically") {
            treeService.sortAlphabetically(node.data.noteId);
        }
        else {
            messagingService.logError("Unknown command: " + ui.cmd);
        }
    }
};

export default {
    pasteAfter,
    pasteInto,
    cut,
    copy,
    contextMenuOptions
};