"use client";

/** A <select> that submits its GET form on change; the button remains for no-JS. */
export default function AutoSubmit({ reset, ...props }) {
  return (
    <select
      {...props}
      onChange={(e) => {
        const f = e.currentTarget.form;
        if (reset && f.elements[reset]) f.elements[reset].value = "";
        f.requestSubmit();
      }}
    />
  );
}
