    # Football Player Injury Risk Prediction - Project Architecture Summary

    ## 1. Executive Summary
    The **Football Player Injury Risk Prediction** project aims to predict injury risks for football players using a multi-module AI system. The current active focus is on **Module 1**, which operates as a Biomechanical Risk Monitor. It evaluates short video clips of a single player to identify their current action, detect risky biomechanical patterns (e.g., knee valgus, hip drop), and localize the likely affected body region. 

    The system prioritizes real-world generalization, low false-positive rates, and practical inference speed on local hardware (e.g., RTX 4060) over pure benchmark accuracy.

    ## 2. System Overview
    The overarching system is designed with a modular architecture:

    *   **Module 1: Biomechanical Risk Monitor (Active)** - Analyzes video footage and pose skeleton data to detect immediate biomechanical risk factors.
    *   **Module 2: Acute Workload Monitor (Planned)** - Analyzes training-log and workload-based injury risks (utilizing time-series encodings).
    *   **Module 3: Historical Risk Profile (Planned)** - Analyzes chronic and historical risk profiles of individual players.
    *   **Fusion Engine (Planned)** - Combines signals from Modules 1, 2, and 3 to output a final, holistic injury probability.

    ## 3. Module 1: Architecture Details

    ### 3.1. Inputs and Outputs
    *   **Input:** Short video clips (broadcast or tactical footage) focused on a single player performing specific football actions (running, decelerating, cutting, jumping, tackling, etc.).
    *   **Outputs:** 
        1.  **Action Category** (e.g., walk, sprint, cut, jump, tackle)
        2.  **Biomechanical Risk Pattern** (e.g., none, knee_valgus, hip_drop, stride_asymmetry, ankle_collapse)
        3.  **Body Region** (e.g., left_knee, right_ankle, spine)
        4.  **Confidence Score**

    ### 3.2. Data Processing Pipeline
    1.  **Data Collection:** Gathering YouTube broadcast/tactical clips.
    2.  **Pose Extraction:** Using tools like MediaPipe or ViTPose to extract 2D/3D skeletal keypoints from the video frames.
    3.  **Preprocessing:** Normalizing poses (e.g., centering around the pelvis/joint 0), handling missing frames, and structuring the data into spatio-temporal graphs `(Nodes = Joints, Edges = Bones, Time = Frames)`.
    4.  **Inference:** Passing the skeleton sequence through the Neural Network model.

    ### 3.3. Modeling Approaches (A/B Testing)
    Module 1 currently compares two distinct architectural branches to find the best balance between stability and expressiveness:

    *   **Approach A: GNN/ST-GCN + TCN (Stable Baseline)**
        *   **Architecture:** Graph Neural Network / Spatial-Temporal Graph Convolutional Network followed by Temporal Convolutional Networks.
        *   **Strengths:** Simpler, stable, easier to calibrate on noisy data, good for low false-positive rates.
    *   **Approach B: GNN + Lightweight Transformer (Expressive Model)**
        *   **Architecture:** Graph Neural Network (for spatial joint relationships) combined with a Transformer (for global temporal dependencies in skeleton sequences).
        *   **Strengths:** Better global temporal reasoning; captures long-range movement context effectively.

    ## 4. Data Flow Diagrams (DFD)

    ### Level 0 DFD: Context Diagram
    ```mermaid
    graph TD
        A[Football Match Video / User] -->|Raw Video Clips| B(Football Injury Risk AI System)
        B -->|Current Action| A
        B -->|Biomechanical Risk| A
        B -->|Body Region at Risk| A
        C[Historical/Workload Logs] -.->|Future Input| B
    ```

    ### Level 1 DFD: Module 1 Pipeline
    ```mermaid
    graph TD
        subgraph Data Acquisition
        A[Raw Video Clips] --> B[Pose Extraction Engine]
        B -->|MediaPipe/ViTPose| C[Skeleton Keypoints Data]
        end

        subgraph Preprocessing
        C --> D[Graph Construction & Normalization]
        D --> E[Spatio-Temporal Graph Data]
        end

        subgraph Core AI Architecture
        E --> F{Model Branches}
        
        F -->|Approach A| G[GNN/ST-GCN + TCN]
        F -->|Approach B| H[GNN + Transformer]
        
        G --> I[Feature Embeddings]
        H --> I
        end

        subgraph Output Heads
        I --> J[Action Classifier]
        I --> K[Risk Pattern Classifier]
        I --> L[Body Region Classifier]
        end

        J --> M((Final Output Profile))
        K --> M
        L --> M
    ```

    ## 5. Implementation Requirements

    To successfully build and deploy this architecture, the following components are required:

    ### 5.1. Data & Annotation Requirements
    *   **Footage:** Short clips (30-60s) of individual players centered on football actions.
    *   **Labeling Framework:** A structured labeling tool (like Label Studio) to annotate:
        *   Risk status (0/1).
        *   Body region.
        *   Qualitative movement notes.
    *   **Pretraining Data:** Existing massive datasets (like ANUBIS) for pretraining the spatial-temporal networks on general human motion before fine-tuning on domain-specific football footage.

    ### 5.2. Technology Stack
    *   **Deep Learning Framework:** PyTorch, PyTorch Geometric, PyTorch Lightning. 
    *   **Pose Estimation:** MediaPipe, ViTPose.
    *   **Experiment Tracking:** Optuna for hyperparameter tuning.
    *   **Package Management:** `uv` (as defined in project docs) and python environments.

    ### 5.3. Evaluation Metrics
    Models are NOT chosen strictly on raw accuracy. They are evaluated on:
    *   False positives per minute (must be minimized).
    *   Precision of risky detections.
    *   Action / Risk-Pattern / Body-Region F1 scores.
    *   Inference speed on local hardware (target: RTX 4060).
    *   Stability across unseen tactical and broadcast camera angles.

    ## 6. Development Workflow
    1.  **Pretrain:** Train motion-understanding representation on large skeleton datasets (ANUBIS).
    2.  **Fine-tune:** Train on small, highly curated football-specific labels.
    3.  **Evaluate:** Test against the offline, non-randomly split test sets.
    4.  **Iterate:** Refine model weights via `notebooks/` and track via `configs/`.