import cv2
import numpy as np
from PIL import Image

def generate_perfect_swag_curve():
    W = 1536
    # Known exact anchor points of the swag bottom edge across the top arch:
    # Left drape ends at x=250, y=410
    # Center dips to y=310..315
    # Right rises to y=480 at x=1300, and connects to flowers at x=1350
    xs = np.array([240, 320, 420, 560, 700, 768, 850, 980, 1120, 1220, 1320, 1400, 1536])
    ys = np.array([420, 385, 350, 340, 318, 312, 315, 345, 385,  415,  480,  495,  500])
    
    # Smooth spline / polynomial interpolation for all 1536 columns
    all_x = np.arange(W)
    # Piecewise cubic spline
    from numpy.polynomial import Polynomial
    # Let's use np.interp with a gaussian blur smoothing
    interp_y = np.interp(all_x, xs, ys)
    smooth_y = cv2.GaussianBlur(interp_y.astype(np.float32).reshape(1, -1), (65, 1), 20.0).flatten()
    
    # Save as swag_curve_master.npy
    np.save('swag_curve_master.npy', smooth_y)
    print("Generated swag_curve_master.npy!")
    return smooth_y

def build_master_v6():
    W, H = 1536, 2752
    swag_y = generate_perfect_swag_curve()
    
    # 1. Load 2.7K reference image (card01_bg.jpg)
    ref = Image.open('reference_wedding/assets/images/card01_bg.jpg').convert('RGB')
    ref_np = np.array(ref).astype(np.float32)
    
    # 2. Load 48MP raw user photo
    user_raw = Image.open('迎宾照.jpg')
    cropped_user = user_raw.crop((197, 451, 5588, 7722))
    s = 0.3045
    sw = int(cropped_user.width * s)
    sh = int(cropped_user.height * s)
    user_scaled = cropped_user.resize((sw, sw * cropped_user.height // cropped_user.width), Image.Resampling.LANCZOS)
    u_np = np.array(user_scaled).astype(np.float32)
    uh, uw, _ = u_np.shape
    
    dst_x1 = max(0, -39)
    dst_y1 = max(0, 277)
    dst_x2 = min(W, -39 + uw)
    dst_y2 = min(H, 277 + uh)
    
    src_x1 = dst_x1 - (-39)
    src_y1 = dst_y1 - 277
    src_x2 = src_x1 + (dst_x2 - dst_x1)
    src_y2 = src_y1 + (dst_y2 - dst_y1)
    
    # 3. Canvas base with feathered bottom:
    u_full = np.copy(ref_np)
    u_full[dst_y1:dst_y2, dst_x1:dst_x2] = u_np[src_y1:src_y2, src_x1:src_x2]
    
    # Feather dress folds across y=2360..2480 into ref floor/skirt
    base_alpha = np.ones((H, W), dtype=np.float32)
    for y in range(H):
        if y < 2360:
            base_alpha[y, :] = 1.0
        elif y >= 2480:
            base_alpha[y, :] = 0.0
        else:
            t = (y - 2360) / (2480 - 2360)
            base_alpha[y, :] = 0.5 * (1.0 + np.cos(np.pi * t))
            
    base = base_alpha[:, :, np.newaxis] * u_full + (1.0 - base_alpha[:, :, np.newaxis]) * ref_np
    
    # 4. Groom detection in base:
    gray_base = cv2.cvtColor(base.astype(np.uint8), cv2.COLOR_RGB2GRAY)
    groom_suit = (gray_base < 85) & (base[:, :, 0] < 95) & (base[:, :, 1] < 95) & (base[:, :, 2] < 95)
    groom_mask = np.zeros((H, W), dtype=bool)
    groom_mask[900:2400, 800:1300] = groom_suit[900:2400, 800:1300]
    groom_mask = cv2.morphologyEx(groom_mask.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    groom_mask = cv2.dilate(groom_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    
    # 5. Extract Flowers from ref_np (right side)
    hsv_ref = cv2.cvtColor(ref_np.astype(np.uint8), cv2.COLOR_RGB2HSV)
    H_ch = hsv_ref[:, :, 0]
    S_ch = hsv_ref[:, :, 1]
    V_ch = hsv_ref[:, :, 2]
    R_ch = ref_np[:, :, 0]
    G_ch = ref_np[:, :, 1]
    B_ch = ref_np[:, :, 2]
    
    # Model bride white veil / gown
    is_model_bride = (R_ch > 192) & (G_ch > 192) & (B_ch > 182) & (S_ch < 35) & (abs(R_ch - G_ch) < 18) & (abs(G_ch - B_ch) < 18)
    
    # Real flowers / leaves / twigs
    is_red = ((H_ch <= 15) | (H_ch >= 165)) & (S_ch > 35) & (V_ch > 20)
    is_pink = (R_ch > 140) & (R_ch > B_ch + 10) & (R_ch > G_ch + 5) & (S_ch > 18)
    is_green = (H_ch >= 25) & (H_ch <= 85) & (S_ch > 18) & (V_ch > 20)
    is_flower_shadow = (V_ch < 70) & (S_ch > 10)
    
    is_flower = (is_red | is_pink | is_green | is_flower_shadow) & (~is_model_bride)
    is_flower[:, :1180] = False
    
    # Flower dense mask
    flower_dense = np.zeros((H, W), dtype=np.float32)
    # Right column (x >= 1350)
    for y in range(H):
        if y >= swag_y[min(W-1, 1350)] and y < 2400:
            flower_dense[y, 1350:] = 1.0
    flower_dense[is_flower] = 1.0
    
    # Close gaps inside flower cluster
    kernel_f = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    flower_dense[:, 1240:] = cv2.morphologyEx(flower_dense[:, 1240:], cv2.MORPH_CLOSE, kernel_f)
    
    # Background curtain gradient for x in [1280, 1420]
    bg_alpha = np.zeros((H, W), dtype=np.float32)
    for x in range(W):
        if x < 1280:
            bg_alpha[:, x] = 0.0
        elif x >= 1420:
            bg_alpha[:, x] = 1.0
        else:
            bg_alpha[:, x] = (x - 1280) / (1420 - 1280)
            
    right_mask = np.maximum(flower_dense, bg_alpha)
    
    # Groom is strictly in front
    right_mask[groom_mask > 0] = 0.0
    
    # Real bride skirt at bottom is in front
    is_real_bride = (base[:, :, 0] > 190) & (base[:, :, 1] > 185) & (base[:, :, 2] > 175) & (gray_base > 190)
    right_mask[2100:2500, :1280][is_real_bride[2100:2500, :1280]] = 0.0
    
    # Feather right_mask
    right_mask_soft = cv2.GaussianBlur(right_mask, (5, 5), 1.0)
    
    # 6. Architectural frame mask:
    frame_mask = np.zeros((H, W), dtype=np.float32)
    
    # Top arch swag: smooth continuous curve from left to right
    for x in range(W):
        top_limit = int(max(swag_y[x] - 12, 0))
        frame_mask[:top_limit, x] = 1.0
        
    # Left velvet curtain:
    frame_mask[:, :240] = 1.0
    
    # Golden tassels:
    cv2.rectangle(frame_mask, (0, 1200), (255, 1950), 1.0, -1)
    
    # Right curtain top above flowers:
    for x in range(1250, W):
        frame_mask[:int(swag_y[x]), x] = 1.0
        
    frame_mask_soft = cv2.GaussianBlur(frame_mask, (25, 25), 8.0)
    
    # Total mask
    total_mask = np.maximum(frame_mask_soft, right_mask_soft)
    total_mask_3d = np.repeat(total_mask[:, :, np.newaxis], 3, axis=2)
    
    # Master composite:
    master = total_mask_3d * ref_np + (1.0 - total_mask_3d) * base
    master = np.clip(master, 0, 255).astype(np.uint8)
    
    # Save master
    Image.fromarray(master).save('assets/card01_master_v6.jpg', quality=98)
    Image.fromarray(master[700:1800, 1050:1450]).save('inspect_v6_crop.jpg', quality=95)
    print("Successfully built assets/card01_master_v6.jpg and inspect_v6_crop.jpg!")

if __name__ == '__main__':
    build_master_v6()
