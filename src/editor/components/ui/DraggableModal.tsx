import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, GripHorizontal } from 'lucide-react';
import { clsx } from 'clsx';

interface DraggableModalProps {
    title: string;
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    width?: number;
    icon?: React.ElementType;
}

export const DraggableModal: React.FC<DraggableModalProps> = ({
    title, isOpen, onClose, children, width = 500, icon: Icon
}) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number, y: number } | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    // Initial center position
    useEffect(() => {
        if (isOpen) {
            setPosition({
                x: (window.innerWidth - width) / 2,
                y: Math.max(50, (window.innerHeight - 600) / 2) // Approximate height or just offset from top
            });
        }
    }, [isOpen, width]);

    // Drag Logic
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging && dragStartRef.current) {
                const deltaX = e.clientX - dragStartRef.current.x;
                const deltaY = e.clientY - dragStartRef.current.y;

                setPosition(prev => ({
                    x: prev.x + deltaX,
                    y: prev.y + deltaY
                }));

                dragStartRef.current = { x: e.clientX, y: e.clientY };
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            dragStartRef.current = null;
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] pointer-events-none">
            {/* Modal Container */}
            <div
                ref={modalRef}
                className={clsx(
                    "absolute pointer-events-auto bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[85vh]",
                    isDragging && "cursor-grabbing"
                )}
                style={{
                    left: position.x,
                    top: position.y,
                    width: width,
                    // transform: `translate(${position.x}px, ${position.y}px)` // Using direct left/top for simpler bounds check if needed later
                }}
            >
                {/* Header (Draggable Handle) */}
                <div
                    className="flex items-center justify-between p-4 border-b border-zinc-800 cursor-grab bg-zinc-900/50 rounded-t-xl select-none"
                    onMouseDown={handleMouseDown}
                >
                    <div className="flex items-center gap-2 text-zinc-100 font-bold">
                        <GripHorizontal size={16} className="text-zinc-600" />
                        {Icon && <Icon size={18} className="text-indigo-400" />}
                        <span>{title}</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                        onMouseDown={(e) => e.stopPropagation()} // Prevent drag when clicking close
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
};
