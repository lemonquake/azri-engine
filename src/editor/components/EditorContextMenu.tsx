import React, { useEffect, useRef } from 'react';

interface EditorContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    onCopy: () => void;
    onPaste: () => void;
    onPasteMirrorX: () => void;
    onPasteMirrorY: () => void;
    onDelete: () => void;
    onSelectAllTiles: () => void;
    onSelectAllCollisions: () => void;
    onSelectSky: () => void;
    onAddAutoCollision: () => void;
    canPaste: boolean;
    hasSelection: boolean;
    hasImageSelection: boolean;
}

export function EditorContextMenu({
    x,
    y,
    onClose,
    onCopy,
    onPaste,
    onPasteMirrorX,
    onPasteMirrorY,
    onDelete,
    onSelectAllTiles,
    onSelectAllCollisions,
    onSelectSky,
    onAddAutoCollision,
    canPaste,
    hasSelection,
    hasImageSelection
}: EditorContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Prevent menu from going off-screen (simple check)
    const style: React.CSSProperties = {
        top: y,
        left: x,
        position: 'fixed',
        zIndex: 1000,
    };

    return (
        <div
            ref={menuRef}
            style={style}
            className="bg-slate-800 border border-slate-600 rounded shadow-xl py-1 w-48 text-sm text-slate-200"
            onContextMenu={(e) => e.preventDefault()} // Prevent native context menu on this menu
        >
            <MenuItem
                label="Copy"
                shortcut="Ctrl+C"
                onClick={onCopy}
                disabled={!hasSelection}
            />
            <MenuItem
                label="Paste"
                shortcut="Ctrl+V"
                onClick={onPaste}
                disabled={!canPaste}
            />
            <div className="h-px bg-slate-700 my-1" />
            <MenuItem
                label="Paste Mirrored X"
                onClick={onPasteMirrorX}
                disabled={!canPaste}
            />
            <MenuItem
                label="Paste Mirrored Y"
                onClick={onPasteMirrorY}
                disabled={!canPaste}
            />
            <div className="h-px bg-slate-700 my-1" />
            <MenuItem
                label="Select All Tiles"
                onClick={onSelectAllTiles}
            />
            <MenuItem
                label="Select All Collisions"
                onClick={onSelectAllCollisions}
            />
            <MenuItem
                label="Select Sky"
                onClick={onSelectSky}
            />
            <div className="h-px bg-slate-700 my-1" />
            <MenuItem
                label="Add Auto-Collision"
                onClick={onAddAutoCollision}
                disabled={!hasImageSelection}
            />
            <div className="h-px bg-slate-700 my-1" />
            <MenuItem
                label="Delete"
                shortcut="Del"
                onClick={onDelete}
                disabled={!hasSelection}
                danger
            />
        </div>
    );
}

function MenuItem({
    label,
    shortcut,
    onClick,
    disabled,
    danger
}: {
    label: string,
    shortcut?: string,
    onClick: () => void,
    disabled?: boolean,
    danger?: boolean
}) {
    return (
        <button
            className={`w-full text-left px-3 py-1.5 flex justify-between items-center transition-colors
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700 active:bg-slate-600'}
                ${danger && !disabled ? 'text-red-400 hover:text-red-300' : ''}
            `}
            onClick={() => {
                if (!disabled) onClick();
            }}
            disabled={disabled}
        >
            <span>{label}</span>
            {shortcut && <span className="text-xs text-slate-500 ml-4">{shortcut}</span>}
        </button>
    );
}
