'use client'

import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown, Check } from "lucide-react";

interface AutocompleteProps {
  label?: string;
  name: string;
  value: string;
  onChange: (name: string, value: string) => void;
  suggestions: string[];
  placeholder?: string;
  required?: boolean;
}

export default function Autocomplete({
  label,
  name,
  value,
  onChange,
  suggestions,
  placeholder,
  required = false
}: AutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!value) return suggestions;
    return suggestions.filter(item =>
      item.toLowerCase().includes(value.toLowerCase()) && item !== value
    );
  }, [value, suggestions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const handleSelect = (item: string) => {
    onChange(name, item);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(name, e.target.value);
    setIsOpen(true);
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {label && <label className="block text-sm font-medium mb-1 text-gray-700">{label}</label>}
      
      <div className="relative">
        <input
          type="text"
          name={name}
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-black/5 focus:border-black transition-all pr-10"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
          <ChevronDown size={16} />
        </div>
      </div>

      {isOpen && (value || filtered.length > 0) && (
        <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto py-1 text-base sm:text-sm">
          {/* Default "Use..." option if value is not in suggestions */}
          {value && !suggestions.includes(value) && (
            <li
              className="px-3 py-2 cursor-pointer hover:bg-gray-100 text-blue-600 font-medium flex items-center gap-2"
              onClick={() => handleSelect(value)}
            >
              <span>Use &quot;{value}&quot;</span>
            </li>
          )}

          {filtered.length > 0 ? (
            filtered.map((item, index) => (
              <li
                key={index}
                className="px-3 py-2 cursor-pointer hover:bg-gray-100 text-gray-900 flex items-center justify-between"
                onClick={() => handleSelect(item)}
              >
                <span>{item}</span>
                {value === item && <Check size={14} className="text-black" />}
              </li>
            ))
          ) : (
             !value && suggestions.map((item, index) => (
              <li
                key={index}
                className="px-3 py-2 cursor-pointer hover:bg-gray-100 text-gray-900"
                onClick={() => handleSelect(item)}
              >
                {item}
              </li>
             ))
          )}
          
          {filtered.length === 0 && value && !suggestions.includes(value) && (
             <li className="px-3 py-2 text-gray-400 text-xs text-center border-t border-gray-100">
               Press Enter or click above to use custom value
             </li>
          )}
        </ul>
      )}
    </div>
  );
}
