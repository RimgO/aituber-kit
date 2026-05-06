import math
import numpy as np

def q_to_mat(q):
    x, y, z, w = q
    return np.array([
        [1 - 2*y*y - 2*z*z, 2*x*y - 2*z*w, 2*x*z + 2*y*w],
        [2*x*y + 2*z*w, 1 - 2*x*x - 2*z*z, 2*y*z - 2*x*w],
        [2*x*z - 2*y*w, 2*y*z + 2*x*w, 1 - 2*x*x - 2*y*y]
    ])

def look_rotation(forward, up):
    forward = forward / np.linalg.norm(forward)
    right = np.cross(up, forward)
    right /= np.linalg.norm(right)
    new_up = np.cross(forward, right)
    m = np.column_stack((right, new_up, forward))
    from scipy.spatial.transform import Rotation as R
    return R.from_matrix(m).as_quat()

# target: leg pointing DOWN and slightly forward
target = np.array([-0.3, -0.5, 0.2])
up = np.array([0, 0, 1]) # body forward

q_look = look_rotation(target, up)

# Correction: rotate (0,-1,0) to (0,0,1)
# Rotation around X by -90 deg?
# Down -> Forward is -90 around X.
from scipy.spatial.transform import Rotation as R
q_corr = R.from_euler('x', -90, degrees=True).as_quat()

q_final = (R.from_quat(q_look) * R.from_quat(q_corr)).as_quat()
print("Result Dir:", q_to_mat(q_final) @ np.array([0, -1, 0]))

