/**
 * AI StudyLab - Shared Data Layer & LocalStorage State
 */

const DEFAULT_DOCUMENTS = [
  {
    id: "doc-1",
    filename: "Distributed_Systems_Ch4_Consensus.pdf",
    format: "PDF",
    subject: "Computer Science",
    size: "4.2 MB",
    pages: 34,
    uploadDate: "2026-10-24",
    status: "Ready",
    statusText: "Ready • Analyzed",
    stats: { notes: 18, questions: 25, mcqs: 40 },
    summary: "Comprehensive breakdown of distributed consensus protocols including Raft, Paxos, and Byzantine Fault Tolerance (BFT). Covers leader election, log replication, safety invariants, and network partition recovery mechanisms.",
    keyTakeaways: [
      "Paxos guarantees safety under asynchronous networks but is notoriously complex to implement.",
      "Raft divides consensus into leader election, log replication, and safety to improve understandability.",
      "CAP theorem establishes that a distributed data store can guarantee at most two out of Consistency, Availability, and Partition Tolerance.",
      "Byzantine Fault Tolerance handles arbitrary (including malicious) failures, requiring 3f + 1 nodes to tolerate f faulty nodes."
    ],
    notes: [
      {
        topic: "1. The Consensus Problem",
        content: "Consensus enables multiple nodes in an unreliable distributed network to agree on a single data value or sequence of state machine operations. Nodes may fail, messages may be delayed or reordered, yet the cluster must maintain consistency."
      },
      {
        topic: "2. The Raft Consensus Algorithm",
        content: "Raft structures time into terms of arbitrary length, numbered with consecutive integers. Each term begins with an election in which one or more candidates attempt to become leader. If a candidate wins the election, it serves as leader for the rest of the term."
      },
      {
        topic: "3. Byzantine Fault Tolerance (BFT)",
        content: "Unlike crash-stop models where failed nodes simply halt, Byzantine models account for nodes exhibiting arbitrary or adversarial behavior, such as transmitting conflicting messages to different peers."
      }
    ],
    importantQuestions: [
      {
        q: "Explain how Raft prevents two leaders from being elected in the same term.",
        marks: 5,
        a: "Raft enforces that each server can vote for at most one candidate per term on a first-come-first-served basis. Because a candidate requires a strict majority of votes from the whole cluster to win, two candidates cannot simultaneously obtain majorities in the same term."
      },
      {
        q: "Compare and contrast Paxos and Raft in terms of state decomposition and understandability.",
        marks: 8,
        a: "While Paxos operates primarily as a single-decree consensus mechanism generalized to multi-Paxos, Raft explicitly decomposes consensus into discrete subproblems: leader election, log replication, and state safety."
      },
      {
        q: "What is the FLP Impossibility Result and what are its practical implications?",
        marks: 6,
        a: "Fischer, Lynch, and Paterson (1985) proved that in a purely asynchronous network, no deterministic consensus protocol can guarantee liveness in the presence of even a single unannounced crash failure. Practical protocols bypass this by using partial synchrony or randomized timeouts."
      }
    ],
    mcqs: [
      {
        id: 1,
        question: "In the Raft consensus protocol, what happens when a follower's election timer expires?",
        options: [
          "It sends a heartbeat to the current leader",
          "It increments its current term and transitions to candidate state",
          "It immediately declares itself as the cluster leader",
          "It enters a standby sleep mode until contacted"
        ],
        answer: 1,
        explanation: "When an election timeout elapses without heartbeats from a leader or candidate, a follower increments its currentTerm and transitions to the Candidate state."
      },
      {
        id: 2,
        question: "According to the CAP Theorem, which two properties does traditional Google Spanner prioritize during normal partitioned operations?",
        options: [
          "Consistency and Availability",
          "Availability and Partition Tolerance",
          "Consistency and Partition Tolerance",
          "Low Latency and Availability"
        ],
        answer: 2,
        explanation: "Google Spanner is classified as a CP system under CAP definitions, strictly guaranteeing linearizable consistency even under network partitions using TrueTime atomic clocks."
      },
      {
        id: 3,
        question: "How many total nodes (N) are required in a BFT system to tolerate 'f' malicious/faulty nodes?",
        options: [
          "2f + 1",
          "3f + 1",
          "f + 2",
          "4f - 1"
        ],
        answer: 1,
        explanation: "In Byzantine Fault Tolerance, at least 3f + 1 nodes are necessary to guarantee safety and liveness when up to f nodes act maliciously."
      }
    ]
  },
  {
    id: "doc-2",
    filename: "Organic_Chemistry_Reactions_Mechanisms.pdf",
    format: "PDF",
    subject: "Chemistry",
    size: "3.6 MB",
    pages: 48,
    uploadDate: "2026-10-23",
    status: "Ready",
    statusText: "Ready • Analyzed",
    stats: { notes: 24, questions: 32, mcqs: 50 },
    summary: "Detailed review of nucleophilic substitution (SN1 vs SN2), elimination reactions (E1 vs E2), and electrophilic aromatic substitution mechanisms with stereochemical outcomes and solvent effects.",
    keyTakeaways: [
      "SN2 proceeds via backside attack causing inversion of stereocenter (Walden inversion). Favored by polar aprotic solvents.",
      "SN1 proceeds via planar carbocation intermediate producing a racemic mixture. Favored by tertiary substrates and polar protic solvents.",
      "Zaitsev's rule predicts the more substituted, thermodynamically stable alkene predominates in elimination reactions.",
      "Electron donating groups (EDG) activate the aromatic ring and direct ortho/para; electron withdrawing groups (EWG) deactivate and direct meta (except halogens)."
    ],
    notes: [
      {
        topic: "1. SN1 vs SN2 Comparison",
        content: "SN2 is a concerted bimolecular reaction with rate = k[Substrate][Nucleophile]. Primary halides react fastest due to lack of steric hindrance. SN1 is a stepwise unimolecular reaction governed by carbocation stability (3° > 2° >> 1°)."
      },
      {
        topic: "2. Electrophilic Aromatic Substitution (EAS)",
        content: "Arenes react with strong electrophiles via an arenium ion (sigma complex) intermediate, restoring aromaticity through rapid loss of a proton."
      }
    ],
    importantQuestions: [
      {
        q: "Why do polar aprotic solvents drastically accelerate SN2 reaction rates?",
        marks: 4,
        a: "Polar aprotic solvents solvate cations effectively via dipole interactions but leave anions (nucleophiles) poorly solvated ('naked'), thereby maximizing nucleophilic reactivity."
      },
      {
        q: "Explain why halogens are deactivating yet ortho/para directing in electrophilic aromatic substitution.",
        marks: 6,
        a: "Halogens are electronegative and inductively withdraw electron density, deactivating the ring. However, lone pair resonance donation stabilizes the carbocation intermediate specifically at ortho and para positions."
      }
    ],
    mcqs: [
      {
        id: 1,
        question: "Which of the following alkyl halides undergoes SN2 substitution most rapidly?",
        options: [
          "1-Bromobutane (Primary)",
          "2-Bromobutane (Secondary)",
          "2-Bromo-2-methylpropane (Tertiary)",
          "Bromobenzene"
        ],
        answer: 0,
        explanation: "1-Bromobutane is a primary alkyl halide experiencing minimal steric hindrance at the reaction center, maximizing SN2 backside attack kinetics."
      },
      {
        id: 2,
        question: "What is the primary stereochemical result of an SN1 reaction on an enantiomerically pure chiral center?",
        options: [
          "Complete inversion of configuration",
          "Complete retention of configuration",
          "Racemization (with slight excess inversion due to ion pairing)",
          "Loss of chirality through ring opening"
        ],
        answer: 2,
        explanation: "Because the carbocation intermediate is planar (sp2 hybridized), attack can occur from either face, yielding a racemic mixture with partial inversion due to shielding by the departing leaving group."
      }
    ]
  },
  {
    id: "doc-3",
    filename: "Data_Structures_Algorithms_Trees_Graphs.docx",
    format: "DOCX",
    subject: "Computer Science",
    size: "2.1 MB",
    pages: 22,
    uploadDate: "2026-10-21",
    status: "Ready",
    statusText: "Ready • Analyzed",
    stats: { notes: 12, questions: 18, mcqs: 35 },
    summary: "In-depth guide to self-balancing binary search trees (AVL & Red-Black trees), Graph traversals (BFS, DFS), Minimum Spanning Tree algorithms (Kruskal & Prim), and Shortest Path (Dijkstra, Bellman-Ford).",
    keyTakeaways: [
      "AVL trees maintain a balance factor of {-1, 0, +1} and offer faster lookups at the expense of more rebalancing rotations during insertions.",
      "Red-Black trees require at most 2 rotations on insert and 3 on deletion, making them preferable for frequent insertions and deletions.",
      "Dijkstra's algorithm computes single-source shortest path in O((V + E) log V) with a Fibonacci or min-heap, but cannot handle negative edge weights.",
      "Bellman-Ford detects negative cycles in O(V * E) time."
    ],
    notes: [
      {
        topic: "1. AVL vs Red-Black Trees",
        content: "AVL trees are more strictly balanced than Red-Black trees. If your application is search-heavy, AVL is superior. For balanced write/read workloads, Red-Black is the industry standard (e.g., C++ std::map, Java TreeMap)."
      },
      {
        topic: "2. Shortest Paths in Graphs",
        content: "Dijkstra employs a greedy strategy relaxing the shortest tentative distance at each step. Bellman-Ford performs dynamic programming relaxation over |V|-1 passes."
      }
    ],
    importantQuestions: [
      {
        q: "Why does Dijkstra's algorithm fail on graphs containing negative edge weights?",
        marks: 5,
        a: "Dijkstra assumes that once a vertex is removed from the priority queue and marked visited, its shortest path is final. A negative edge encountered later could yield a cheaper overall cost, violating the greedy invariant."
      }
    ],
    mcqs: [
      {
        id: 1,
        question: "What is the maximum height of a Red-Black tree containing N internal nodes?",
        options: [
          "log2(N)",
          "2 * log2(N + 1)",
          "1.44 * log2(N)",
          "N / 2"
        ],
        answer: 1,
        explanation: "A Red-Black tree with N internal nodes has height at most 2 * log2(N + 1), guaranteeing O(log N) search, insert, and delete performance."
      }
    ]
  },
  {
    id: "doc-4",
    filename: "Macroeconomics_Fiscal_Monetary_Policy.pptx",
    format: "PPTX",
    subject: "Economics",
    size: "5.8 MB",
    pages: 42,
    uploadDate: "2026-10-19",
    status: "Ready",
    statusText: "Ready • Analyzed",
    stats: { notes: 16, questions: 20, mcqs: 30 },
    summary: "Lecture slides on IS-LM framework, Phillips Curve dynamics, central bank interest rate transmission, quantitative easing, and fiscal multiplier effects in open vs closed economies.",
    keyTakeaways: [
      "IS curve represents equilibrium in the goods market; downward sloping with respect to interest rate.",
      "LM curve represents liquidity preference / money market equilibrium; upward sloping with respect to interest rate.",
      "Expansionary fiscal policy shifts IS curve rightward, raising output and nominal interest rates.",
      "Monetary transmission mechanism functions via interest rate channels, exchange rates, and credit availability."
    ],
    notes: [
      {
        topic: "1. IS-LM Equilibrium",
        content: "The intersection of the IS and LM curves establishes simultaneous equilibrium in both the goods and financial asset markets for a given price level."
      }
    ],
    importantQuestions: [
      {
        q: "Explain the Crowding-Out effect in the context of expansionary fiscal policy.",
        marks: 6,
        a: "When government borrowing increases to fund fiscal expenditure, it bids up interest rates. Higher interest rates dampen private capital investment and consumption, offsetting part of the stimulus."
      }
    ],
    mcqs: [
      {
        id: 1,
        question: "What happens to the LM curve when the central bank increases the money supply?",
        options: [
          "Shifts upwards / leftwards",
          "Shifts downwards / rightwards",
          "Remains unchanged but becomes steeper",
          "Inverts its slope to negative"
        ],
        answer: 1,
        explanation: "An increase in real money balances shifts the LM curve down/right, lowering equilibrium interest rates for any given output level."
      }
    ]
  },
  {
    id: "doc-5",
    filename: "Neurobiology_Synaptic_Transmission.pdf",
    format: "PDF",
    subject: "Biology",
    size: "4.7 MB",
    pages: 36,
    uploadDate: "2026-10-18",
    status: "Ready",
    statusText: "Ready • Analyzed",
    stats: { notes: 20, questions: 22, mcqs: 42 },
    summary: "Mechanisms of action potentials, voltage-gated ion channels, SNARE-mediated neurotransmitter release at the presynaptic terminal, and ionotropic vs metabotropic postsynaptic receptors.",
    keyTakeaways: [
      "Action potentials are initiated by voltage-gated Na+ channels opening rapidly upon reaching threshold (~ -55 mV).",
      "SNARE complex (synaptobrevin, syntaxin, SNAP-25) mediates vesicle docking and fusion triggered by presynaptic Ca2+ influx.",
      "Ionotropic receptors operate fast ligand-gated ion channels; metabotropic receptors signal through G-protein cascades."
    ],
    notes: [
      {
        topic: "1. Action Potential Phases",
        content: "Resting membrane potential (-70mV) -> Depolarization (Na+ influx) -> Peak (+30mV) -> Repolarization (K+ efflux) -> Hyperpolarization (delayed K+ closure) -> Restored by Na+/K+ ATPase pump."
      }
    ],
    importantQuestions: [
      {
        q: "Detail the role of Synaptotagmin-1 as a calcium sensor in synaptic vesicle exocytosis.",
        marks: 7,
        a: "Synaptotagmin-1 contains two C2 domains that bind Ca2+ ions. When Ca2+ enters through voltage-gated channels, it triggers synaptotagmin to interact with membranes and the SNARE complex, driving ultrafast pore opening."
      }
    ],
    mcqs: [
      {
        id: 1,
        question: "Which ion channel is primarily responsible for the rapid repolarization phase of a neuronal action potential?",
        options: [
          "Voltage-gated Calcium channels",
          "Voltage-gated Sodium channels",
          "Voltage-gated Potassium channels",
          "Chloride leak channels"
        ],
        answer: 2,
        explanation: "Delayed rectifier voltage-gated potassium channels open in response to depolarization, driving K+ efflux and rapidly bringing membrane potential back toward resting negative values."
      }
    ]
  },
  {
    id: "doc-6",
    filename: "Machine_Learning_Transformers_Attention.pdf",
    format: "PDF",
    subject: "Artificial Intelligence",
    size: "6.3 MB",
    pages: 52,
    uploadDate: "2026-10-16",
    status: "Ready",
    statusText: "Ready • Analyzed",
    stats: { notes: 30, questions: 35, mcqs: 55 },
    summary: "Deep dive into the Transformer architecture ('Attention Is All You Need'). Scaled Dot-Product Attention, Multi-Head Attention, Positional Encodings, Feed-Forward Networks, and LayerNorm nuances.",
    keyTakeaways: [
      "Attention(Q, K, V) = softmax(Q * K^T / sqrt(d_k)) * V enables parallelized sequence processing without recurrent bottlenecks.",
      "Multi-Head attention allows the model to jointly attend to information from different representation subspaces at different positions.",
      "Positional encodings inject token order into invariant self-attention computations using sinusoids or learned embeddings.",
      "FlashAttention optimizes memory hierarchy (SRAM vs HBM) avoiding quadratic IO bottlenecks."
    ],
    notes: [
      {
        topic: "1. Scaled Dot-Product Attention",
        content: "Scaling by 1/sqrt(d_k) prevents large dot products from pushing the softmax function into regions with vanishingly small gradients."
      }
    ],
    importantQuestions: [
      {
        q: "Why do standard Transformers need positional encodings unlike RNNs or CNNs?",
        marks: 5,
        a: "Self-attention is permutation-invariant: reordering words yields identical outputs if positions are not explicitly injected. RNNs inherently model sequence order via sequential recurrence."
      }
    ],
    mcqs: [
      {
        id: 1,
        question: "In standard Transformer attention, why are query-key dot products divided by sqrt(d_k)?",
        options: [
          "To enforce non-negativity",
          "To avoid vanishing gradients in the softmax function for large dimensions",
          "To ensure matrix multiplication symmetry",
          "To convert dot products directly into probabilities"
        ],
        answer: 1,
        explanation: "As d_k grows, dot products grow large in magnitude, pushing softmax into regions with extremely tiny gradients. Scaling prevents this saturation."
      }
    ]
  }
];

// Helper methods for localStorage management
const StudyLabStore = {
  STORAGE_KEY: "ai_studylab_documents_v2",
  STATS_KEY: "ai_studylab_user_stats",
  USER_KEY: "ai_studylab_current_user",

  init() {
    if (!localStorage.getItem(this.STORAGE_KEY)) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(DEFAULT_DOCUMENTS));
    }
    if (!localStorage.getItem(this.STATS_KEY)) {
      localStorage.setItem(
        this.STATS_KEY,
        JSON.stringify({
          totalDocuments: DEFAULT_DOCUMENTS.length,
          notesGenerated: 120,
          questionsCreated: 152,
          mcqsGenerated: 252,
          quizzesTaken: 14,
          accuracyRate: "92%"
        })
      );
    }
    if (!localStorage.getItem(this.USER_KEY)) {
      localStorage.setItem(
        this.USER_KEY,
        JSON.stringify({
          name: "Alex Morgan",
          email: "alex.morgan@example.com",
          role: "Computer Science & Engineering",
          avatar: "AM"
        })
      );
    }
  },

  getDocuments() {
    this.init();
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : DEFAULT_DOCUMENTS;
    } catch (e) {
      console.error("Error reading documents:", e);
      return DEFAULT_DOCUMENTS;
    }
  },

  getDocumentById(id) {
    const docs = this.getDocuments();
    return docs.find(d => d.id === id) || docs[0];
  },

  saveDocument(doc) {
    const docs = this.getDocuments();
    const existingIndex = docs.findIndex(d => d.id === doc.id);
    if (existingIndex >= 0) {
      docs[existingIndex] = doc;
    } else {
      docs.unshift(doc);
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(docs));
    this.recalculateStats();
    return doc;
  },

  deleteDocument(id) {
    let docs = this.getDocuments();
    docs = docs.filter(d => d.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(docs));
    this.recalculateStats();
    return docs;
  },

  recalculateStats() {
    const docs = this.getDocuments();
    let notes = 0;
    let questions = 0;
    let mcqs = 0;
    docs.forEach(d => {
      notes += (d.stats && d.stats.notes) || (d.notes ? d.notes.length : 10);
      questions += (d.stats && d.stats.questions) || (d.importantQuestions ? d.importantQuestions.length : 15);
      mcqs += (d.stats && d.stats.mcqs) || (d.mcqs ? d.mcqs.length : 25);
    });

    const stats = {
      totalDocuments: docs.length,
      notesGenerated: notes,
      questionsCreated: questions,
      mcqsGenerated: mcqs,
      quizzesTaken: 14,
      accuracyRate: "92%"
    };
    localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));
    return stats;
  },

  getStats() {
    this.init();
    try {
      const stats = localStorage.getItem(this.STATS_KEY);
      return stats ? JSON.parse(stats) : this.recalculateStats();
    } catch (e) {
      return this.recalculateStats();
    }
  },

  getUser() {
    this.init();
    try {
      const user = localStorage.getItem(this.USER_KEY);
      return user ? JSON.parse(user) : { name: "Alex Morgan", email: "alex.morgan@example.com", avatar: "AM" };
    } catch (e) {
      return { name: "Alex Morgan", email: "alex.morgan@example.com", avatar: "AM" };
    }
  },

  resetDefaults() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(DEFAULT_DOCUMENTS));
    this.recalculateStats();
  }
};

// Initialize immediately
StudyLabStore.init();

