import cv2
import numpy as np
import os
from PIL import Image

os.makedirs('assets/images', exist_ok=True)

def clean_by_color_diff(img, y1, y2, x1, x2, bg_y, bg_x, thresh=16, radius=4, dilate_iter=2):
    roi = img[y1:y2, x1:x2]
    bg_color = img[bg_y, bg_x].astype(float)
    diff = np.linalg.norm(roi.astype(float) - bg_color, axis=2)
    mask_roi = (diff > thresh).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask_roi = cv2.dilate(mask_roi, kernel, iterations=dilate_iter)
    
    full_mask = np.zeros(img.shape[:2], dtype=np.uint8)
    full_mask[y1:y2, x1:x2] = mask_roi
    return cv2.inpaint(img, full_mask, inpaintRadius=radius, flags=cv2.INPAINT_TELEA)

print("Starting asset processing...")

# -------------------------------------------------------------
# Card 02: Ring background
# -------------------------------------------------------------
c02 = cv2.imread('assets/cards_raw/c02_06.png')
# Clean text
c02 = clean_by_color_diff(c02, 215, 310, 50, 245, 210, 150, thresh=15, radius=4)
# Clean music button
c02 = clean_by_color_diff(c02, 15, 65, 230, 290, 40, 220, thresh=15, radius=5)
# Clean bottom arrow
c02 = clean_by_color_diff(c02, 475, 545, 120, 185, 470, 150, thresh=15, radius=5)
cv2.imwrite('assets/images/card02_bg.jpg', c02, [cv2.IMWRITE_JPEG_QUALITY, 95])
print("Card 02 processed.")

# -------------------------------------------------------------
# Card 03: Time schedule background
# -------------------------------------------------------------
c03 = cv2.imread('assets/cards_raw/c03_06.png')
# Clean TIME / 婚礼时间
c03 = clean_by_color_diff(c03, 65, 135, 75, 235, 100, 50, thresh=14, radius=4)
# Clean Date 2025 / 05/20 / SATURDAY
c03 = clean_by_color_diff(c03, 135, 255, 65, 245, 180, 50, thresh=14, radius=4)
# Clean Schedule items
c03 = clean_by_color_diff(c03, 255, 410, 60, 250, 320, 50, thresh=14, radius=4)
# Clean 3 / 6
c03 = clean_by_color_diff(c03, 470, 525, 120, 190, 490, 80, thresh=14, radius=4)
# Clean music button
c03 = clean_by_color_diff(c03, 15, 65, 235, 295, 40, 220, thresh=15, radius=5)
cv2.imwrite('assets/images/card03_bg.jpg', c03, [cv2.IMWRITE_JPEG_QUALITY, 95])
print("Card 03 processed.")

# -------------------------------------------------------------
# Card 04: Quote background
# -------------------------------------------------------------
c04 = cv2.imread('assets/cards_raw/c04_06.png')
# Clean quote lines
c04 = clean_by_color_diff(c04, 225, 345, 55, 255, 210, 150, thresh=15, radius=4)
# Clean arrow
c04 = clean_by_color_diff(c04, 470, 545, 120, 185, 465, 150, thresh=15, radius=5)
# Clean music button
c04 = clean_by_color_diff(c04, 15, 65, 235, 295, 40, 220, thresh=15, radius=5)
cv2.imwrite('assets/images/card04_bg.jpg', c04, [cv2.IMWRITE_JPEG_QUALITY, 95])
print("Card 04 processed.")

# -------------------------------------------------------------
# Card 05: Location background
# -------------------------------------------------------------
c05 = cv2.imread('assets/cards_raw/c05_06.png')
# Clean header LOCATION / 婚礼地点
c05 = clean_by_color_diff(c05, 65, 135, 75, 235, 100, 50, thresh=14, radius=4)
# Clean church icon & Hotel name & address & button
c05 = clean_by_color_diff(c05, 140, 420, 50, 255, 250, 50, thresh=14, radius=5)
# Clean 5 / 6
c05 = clean_by_color_diff(c05, 470, 525, 120, 190, 490, 80, thresh=14, radius=4)
# Clean music button
c05 = clean_by_color_diff(c05, 15, 65, 230, 290, 40, 220, thresh=15, radius=5)
cv2.imwrite('assets/images/card05_bg.jpg', c05, [cv2.IMWRITE_JPEG_QUALITY, 95])
print("Card 05 processed.")

# -------------------------------------------------------------
# Card 06: Grand Archway background
# -------------------------------------------------------------
c06 = cv2.imread('assets/cards_raw/c06_06.png')
# Clean 期待与您相见
c06 = clean_by_color_diff(c06, 255, 325, 65, 245, 290, 50, thresh=15, radius=5)
# Clean arrow
c06 = clean_by_color_diff(c06, 470, 545, 120, 185, 465, 150, thresh=15, radius=5)
# Clean music button
c06 = clean_by_color_diff(c06, 15, 65, 235, 295, 40, 220, thresh=15, radius=5)
cv2.imwrite('assets/images/card06_bg.jpg', c06, [cv2.IMWRITE_JPEG_QUALITY, 95])
print("Card 06 processed.")

# -------------------------------------------------------------
# Card 08: Full Invitation Letter (using c08_full.png)
# -------------------------------------------------------------
c08 = cv2.imread('assets/cards_raw/c08_full.png')
# Clean center text from y: 60 to 520, x: 100 to 450 (keep wax seal on right x: 380..555, y: 420..580)
# Top header
c08 = clean_by_color_diff(c08, 60, 130, 150, 400, 90, 120, thresh=14, radius=4)
# Jaryn & Hanna script
c08 = clean_by_color_diff(c08, 130, 230, 90, 450, 180, 120, thresh=14, radius=4)
# Body text
c08 = clean_by_color_diff(c08, 230, 380, 100, 440, 300, 120, thresh=14, radius=4)
# Time section
c08 = clean_by_color_diff(c08, 380, 460, 120, 400, 420, 120, thresh=14, radius=4)
# Location section (left of wax seal, x: 100 to 360)
c08 = clean_by_color_diff(c08, 460, 540, 100, 360, 500, 120, thresh=14, radius=4)
# Clean music button top right
c08 = clean_by_color_diff(c08, 15, 75, 480, 550, 40, 460, thresh=15, radius=5)
cv2.imwrite('assets/images/card08_bg.jpg', c08, [cv2.IMWRITE_JPEG_QUALITY, 95])
print("Card 08 processed.")

print("All card backgrounds prepared successfully!")
