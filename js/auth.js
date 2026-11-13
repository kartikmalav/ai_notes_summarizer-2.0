/**
 * AI StudyLab - Authentication Controller (Login & Signup)
 */

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");

  // If already logged in with a valid token, skip auth form unless explicit ?switch=1
  const storedToken = StudyLabAPI.getToken();
  if (storedToken && !StudyLabUI.getQueryParam("switch")) {
    if (StudyLabAPI.isTokenExpiredOrMalformed(storedToken)) {
      StudyLabAPI.clearSession();
    } else {
      StudyLabAPI.getMe()
        .then(() => {
          window.location.replace("dashboard.html");
        })
        .catch(() => {
          StudyLabAPI.clearSession();
        });
    }
  }

  const forgotBtn = document.getElementById("forgot-password-btn");
  if (forgotBtn) {
    forgotBtn.addEventListener("click", () => {
      StudyLabUI.showToast(
        "Password reset is disabled in this educational workspace demo. You can create a new account via Sign Up.",
        "info"
      );
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email")?.value.trim() || "";
      const password = document.getElementById("login-password")?.value || "";
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      if (!email || !password) {
        StudyLabUI.showToast("Please enter both email and password.", "danger");
        return;
      }

      const originalHtml = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing In...';

      try {
        const res = await StudyLabAPI.login({ email, password });
        StudyLabAPI.setSession(res.token, res.user);
        StudyLabUI.showToast("Signed in successfully!", "success");
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 350);
      } catch (err) {
        StudyLabUI.showToast(err.message, "danger");
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("signup-name")?.value.trim() || "";
      const email = document.getElementById("signup-email")?.value.trim() || "";
      const major = document.getElementById("signup-major")?.value.trim() || "General Studies";
      const password = document.getElementById("signup-password")?.value || "";
      const submitBtn = signupForm.querySelector('button[type="submit"]');

      if (name.length < 2) {
        StudyLabUI.showToast("Please enter your full name.", "danger");
        return;
      }
      if (password.length < 6) {
        StudyLabUI.showToast("Password must be at least 6 characters long.", "danger");
        return;
      }

      const originalHtml = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';

      try {
        const res = await StudyLabAPI.signup({ name, email, major, password });
        StudyLabAPI.setSession(res.token, res.user);
        StudyLabUI.showToast("Account created! Welcome to AI StudyLab.", "success");
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 350);
      } catch (err) {
        StudyLabUI.showToast(err.message, "danger");
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
      }
    });
  }
});

