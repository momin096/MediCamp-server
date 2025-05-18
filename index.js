require("dotenv").config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.PAYMENT_SECRET_kEY);

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


const app = express();
const port = process.env.PORT || 5000;


// Middleware
app.use(cors({
    origin: ['https://medicamp-d8e07.web.app', 'http://localhost:5173'],
    credentials: true,
}));
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tp3bo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        const db = client.db('MediCamp')

        const usersCollection = db.collection('users');
        const campsCollection = db.collection('camps');
        const registrationsCollection = db.collection('registrations');
        const paymentsCollection = db.collection('payments');

        // generate json web token 
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.SECRET_KEY, { expiresIn: '1h' });
            res.send({ token });
        })

        // verifyJWT middleware
        const verifyToken = (req, res, next) => {
            // Check if authorization header exists
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Forbidden access' });
            }

            const token = req.headers.authorization.split(' ')[1];
            if (!token) {
                return res.status(401).send({ message: 'Forbidden access' });
            }

            jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Forbidden access' });
                }
                req.decoded = decoded;
                next();
            });
        };


        const verifyOrganizer = async (req, res, next) => {
            const email = req?.user?.email;
            const query = { email }
            const user = await usersCollection.findOne(query)

            if (!user || user?.role !== 'Organizer') return res.status(401).send({ message: 'UnAuthorize Access' })

            next()
        }


        // Assuming Camp is your model
        app.get('/top-camps', async (req, res) => {
            const popularCamps = await campsCollection.find()
                .sort({ participants: -1 })
                .limit(6).toArray()

            res.send(popularCamps);
        })




        // users related apis --------------------------------------------
        app.post('/users/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const query = { email }
            const isExist = await usersCollection.findOne(query)
            if (isExist) {
                return res.send(isExist)
            }
            const result = await usersCollection.insertOne({
                ...user,
                role: 'Participant',
            })
            res.send(result)
        })
        // Get  Profile 
        app.get('/profile/:email', async (req, res) => {
            const email = req.params.email
            const query = { email }
            const result = await usersCollection.findOne(query)
            res.send(result)
        })

        // update a profile in db 
        app.patch('/update-profile/:email', async (req, res) => {
            const email = req.params.email
            const query = { email }
            const updatedData = req.body
            const updatedDoc = {
                $set: updatedData
            }
            const result = await usersCollection.updateOne(query, updatedDoc)
            res.send(result)
        })

        // get a user role   
        app.get('/users/role/:email', async (req, res) => {
            const email = req.params.email
            const query = { email }
            const result = await usersCollection.findOne(query)
            res.send({ role: result?.role })
        })
      



        // camp related apis ----------------------------------------

        // add a camp registrations and increase the participants count 
        app.post('/registrations', async (req, res) => {
            const registration = req.body
            const result = await registrationsCollection.insertOne(registration)

            // Increment participant count
            const campId = registration.campId
            const filter = { _id: new ObjectId(campId) }
            await campsCollection.updateOne(filter, { $inc: { participants: 1 } })
            res.send(result)
        });

        // get all registered camps by email 
        app.get('/registered-camps', async (req, res) => {
            const email = req.query.email;

            let query = {};
            if (email) {
                query = { participantEmail: email };
            }

            const result = await registrationsCollection.find(query).toArray();
            res.send(result);
        })


        // cancel / delete registered camp
        app.delete('/delete-registered-camp/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await registrationsCollection.deleteOne(query)
            res.send(result)
        })

        // update status 
        app.patch('/change-status/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: { status: 'Confirmed' }
            }
            const result = await registrationsCollection.updateOne(query, updatedDoc)
            res.send(result)
        })
        // change payment status
        app.patch('/registered-camps/payment/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    payment: 'Paid'
                }
            }
            const result = await registrationsCollection.updateOne(query, updatedDoc);
            res.send(result);
        });


        // create payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const priceNumber = parseInt(price);

            const amount = priceNumber * 100

            try {
                const { client_secret } = await stripe.paymentIntents.create({
                    amount,
                    currency: 'usd',
                    automatic_payment_methods: {
                        enabled: true,
                    },
                });

                res.send({ clientSecret: client_secret });
            } catch (error) {
                console.error("Stripe error:", error.message);
                res.status(500).send({ error: error.message });
            }
        });


        // insert payment info 
        app.post('/payments', async (req, res) => {
            const data = req.body
            const result = await paymentsCollection.insertOne(data)
            res.send(result)
        })

        app.get('/payment-history', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await paymentsCollection.aggregate([
                {
                    $match: query,
                },
                {
                    $addFields: {
                        campId: { $toObjectId: '$campId' }
                    }
                },
                {
                    $lookup: {
                        from: 'registrations',
                        localField: 'campId',
                        foreignField: '_id',
                        as: 'registrationsInfo'
                    }
                },
                {
                    $unwind: '$registrationsInfo'
                },
                {
                    $addFields: {
                        campName: '$registrationsInfo.campName',
                        campFees: '$registrationsInfo.campFees',
                        status: '$registrationsInfo.status'
                    }
                },
                {
                    $project: {
                        registrationsInfo: 0,
                    }
                }
            ]).toArray()
            res.send(result);
        });



        // ADMIN APIS  ---------------------------------------------------


        // add a camp 
        app.post('/camps', async (req, res) => {
            const campDetails = req.body
            const result = await campsCollection.insertOne(campDetails)
            res.send(result)
        })

        // get all camps
        app.get('/camps', async (req, res) => {
            const result = await campsCollection.find().toArray()
            res.send(result)
        })

        // delete a camp 
        app.delete('/camps/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await campsCollection.deleteOne(query)
            res.send(result)
        })

        // // update a camp
        app.patch('/camps/:id', async (req, res) => {
            const id = req.params.id
            const data = req.body
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: data
            }
            const result = await campsCollection.updateOne(query, updatedDoc)
            res.send(result)
        })

        // get a specific camp 
        app.get('/camps/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await campsCollection.findOne(query)
            res.send(result)
        })





        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Boss Is Running!')
})

app.listen(port, () => {
    console.log(`Boss is running on port: ${port}`)
})