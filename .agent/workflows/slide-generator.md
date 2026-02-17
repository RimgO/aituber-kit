---
description: Create a slide presentation from markdown and script
---

# Slide Generator Workflow

This workflow takes a markdown content for slides and a script text, then generates the necessary files (`slides.md` and `scripts.json`) in a new directory under `public/slides/`.

## Prerequisites
- The user must provide:
    1.  **Slide Name**: The name of the folder to create (e.g., `my-presentation`).
    2.  **Markdown Content**: The content for `slides.md` (Marp format).
    3.  **Script Content**: The text content to be converted into `scripts.json`. The script should be formatted such that each line or paragraph corresponds to a slide page.

## Steps

1.  **Create Directory**: Create a new directory for the slide.
    ```bash
    mkdir -p public/slides/[Slide Name]
    ```

2.  **Create slides.md**: Write the provided markdown content to `public/slides/[Slide Name]/slides.md`.

3.  **Generate scripts.json**: Parse the provided script text and create `public/slides/[Slide Name]/scripts.json`.
    -   *Note*: You will need to manually map the script lines to the slide pages. By default, split the script by newlines or paragraphs and assign them sequentially to `page: 0`, `page: 1`, etc.
    -   **Format**:
        ```json
        [
          {
            "page": 0,
            "line": "Script for slide 1...",
            "notes": ""
          },
          ...
        ]
        ```

4.  **Create supplement.txt (Optional)**: If provided, write supplementary text to `public/slides/[Slide Name]/supplement.txt`.

5.  **Copy Theme (Optional)**: If a specific theme is needed, copy `theme.css` to the directory or ensure usage of default themes.

6.  **Verify**: Check that the files exist.
    ```bash
    ls -l public/slides/[Slide Name]/
    ```

7.  **Notify User**: Inform the user that the slide has been generated and tell them to enable "Slide Mode" in settings and enter the `[Slide Name]`.
