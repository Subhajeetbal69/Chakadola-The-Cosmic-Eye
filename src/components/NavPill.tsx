import { NavLink, useLocation } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import './NavPill.css';

interface NavPillProps {
  conjCount?: number;
  hideLiveFeed?: boolean;
}

export function NavPill({ conjCount, hideLiveFeed }: NavPillProps) {
  const location = useLocation();
  const indicatorRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLElement>(null);
  const [activeTabElement, setActiveTabElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // When location changes, find the active NavLink and update indicator
    if (!pillRef.current) return;
    // We use setTimeout to ensure React Router has applied the 'active' class
    const timeoutId = setTimeout(() => {
      const activeLink = pillRef.current?.querySelector('a.active') as HTMLElement;
      if (activeLink) {
        setActiveTabElement(activeLink);
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [location.pathname]);

  useEffect(() => {
    if (activeTabElement && indicatorRef.current) {
      indicatorRef.current.style.transition = 'left 0.48s cubic-bezier(0.16, 1, 0.3, 1), width 0.48s cubic-bezier(0.16, 1, 0.3, 1)';
      // offsetLeft is relative to pill container
      indicatorRef.current.style.left = activeTabElement.offsetLeft + 'px';
      indicatorRef.current.style.width = activeTabElement.offsetWidth + 'px';
    }
  }, [activeTabElement]);

  useEffect(() => {
    const handleResize = () => {
      if (activeTabElement && indicatorRef.current) {
        indicatorRef.current.style.transition = 'none';
        indicatorRef.current.style.left = activeTabElement.offsetLeft + 'px';
        indicatorRef.current.style.width = activeTabElement.offsetWidth + 'px';
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTabElement]);

  // Initial layout without transition
  useEffect(() => {
    if (activeTabElement && indicatorRef.current) {
      indicatorRef.current.style.transition = 'none';
      indicatorRef.current.style.left = activeTabElement.offsetLeft + 'px';
      indicatorRef.current.style.width = activeTabElement.offsetWidth + 'px';
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (indicatorRef.current) {
            indicatorRef.current.style.transition = '';
          }
        });
      });
    }
  }, []);

  return (
    <div className="pill-wrapper">
      <nav className="pill" ref={pillRef} role="tablist" aria-label="Mission navigation">
        <div className="indicator" ref={indicatorRef}></div>
        
        <NavLink to="/" className="tab" role="tab" end>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 18a6 6 0 0 0 0-12"/>
            <path d="M12 22a10 10 0 0 0 0-20"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
          </svg>
          Mission
        </NavLink>

        <NavLink to="/earth" className="tab" role="tab">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/>
            <path d="M3.6 9h16.8M3.6 15h16.8"/>
            <path d="M12 3C9.5 6.5 8 9.1 8 12s1.5 5.5 4 9"/>
            <path d="M12 3c2.5 3.5 4 6.1 4 9s-1.5 5.5-4 9"/>
          </svg>
          Earth Tracking
        </NavLink>

        <NavLink to="/alert" className="tab" role="tab">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3 5 6v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z"/>
          </svg>
          Alert Center
          {(conjCount !== undefined && conjCount > 0) && (
            <span className="badge" aria-label={`${conjCount} alerts`}>{conjCount}</span>
          )}
        </NavLink>
      </nav>

      {!hideLiveFeed && (
        <span className="live-feed" aria-label="Live feed active">
          <span className="live-dot" aria-hidden="true"></span>
          Live Feed
        </span>
      )}
    </div>
  );
}
