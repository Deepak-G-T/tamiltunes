import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { loadTaste } from '../../lib/tasteApi';
import { shouldOpenPicker } from '../../lib/taste';

const ASKED_KEY = 'tamiltunes_onboarding_asked';
const asked = () => { try { return sessionStorage.getItem(ASKED_KEY) === '1'; } catch { return false; } };
const markAsked = () => { try { sessionStorage.setItem(ASKED_KEY, '1'); } catch { /* it may ask again next page load: harmless */ } };

/**
 * On a new account's first visit, take the person to the taste picker once. Renders nothing. If the server cannot be reached it does nothing
 * (a picker is never worth blocking the app for). People who already listen a lot are not interrupted (the server decides).
 */
const OnboardingGate = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const checked = useRef(null);

  useEffect(() => {
    if (!isAuthenticated || !user?.id || checked.current === user.id || asked()) return undefined;
    checked.current = user.id;
    let live = true;
    loadTaste().then((data) => {
      if (live && shouldOpenPicker({ shouldOnboard: data?.shouldOnboard, pathname, askedThisSession: asked() })) {
        markAsked();
        navigate('/welcome', { replace: true });
      }
    }).catch(() => { /* fail open */ });
    return () => { live = false; };
  }, [isAuthenticated, user?.id, pathname, navigate]);

  return null;
};

export default OnboardingGate;
