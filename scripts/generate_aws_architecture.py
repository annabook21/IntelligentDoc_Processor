from diagrams import Diagram, Cluster, Edge
from diagrams.aws.general import Client, Generic
from diagrams.aws.network import CloudFront, APIGateway
from diagrams.aws.storage import S3
from diagrams.aws.security import Cognito
from diagrams.aws.compute import Lambda
from diagrams.aws.integration import Eventbridge
from diagrams.aws.management import Cloudwatch
from diagrams.aws.database import Dynamodb


def main() -> None:
    # Render a PNG with a white background and a wide layout suitable for docs
    with Diagram(
        "AWS Intelligent Document Processor",
        show=False,
        filename="images/aws-style-architecture",
        outformat="png",
        graph_attr={
            "bgcolor": "white",
            "rankdir": "LR",
            "pad": "0.5",
            "nodesep": "0.5",
            "ranksep": "1.0",
        },
    ):
        user = Client("Users")

        with Cluster("Web UI component"):
            cf = CloudFront("Amazon CloudFront\n(1)")
            s3_frontend = S3("S3 Frontend Bucket")
            cognito = Cognito("Amazon Cognito\n(2)")
            cf >> s3_frontend

        with Cluster("API component"):
            apigw = APIGateway("API Gateway\n(3)")
            upload = Lambda("upload-handler\n(4)")
            search = Lambda("search-handler\n(12)")
            apigw >> upload
            apigw >> search

        with Cluster("Storage & DR"):
            ddb_meta = Dynamodb("document-metadata\n(Global Table)")
            ddb_hash = Dynamodb("document-hash-registry")
            ddb_names = Dynamodb("document-names")

        with Cluster("Processing pipeline"):
            s3_docs = S3("S3 Documents Bucket")
            evb = Eventbridge("EventBridge\n(6)")
            sfn = Generic("Step Functions\nstate machine")
            dup = Lambda("check-duplicate\n(7)")
            textract_start = Lambda("textract-start\n(8)")
            textract = Generic("Amazon Textract")
            textract_status = Lambda("textract-status")
            comprehend_fn = Lambda("comprehend-analyze\n(9)")
            comprehend = Generic("Amazon Comprehend")
            bedrock_fn = Lambda("bedrock-summarize\n(10)")
            bedrock = Generic("Amazon Bedrock")
            store = Lambda("store-metadata\n(11)")

            s3_docs >> Edge(label="ObjectCreated") >> evb >> sfn
            sfn >> dup
            dup >> Edge(label="duplicate") >> store
            dup >> Edge(label="unique") >> textract_start >> textract >> textract_status
            textract_status >> comprehend_fn >> comprehend >> bedrock_fn >> bedrock >> store

            store >> ddb_meta
            store >> ddb_names
            dup >> ddb_hash

        with Cluster("Observability"):
            cw = Cloudwatch("CloudWatch\n(13)")

        # Flows and auth
        user >> Edge(label="(1)") >> cf
        cf >> Edge(label="UI") >> s3_frontend
        user >> Edge(style="dashed", label="sign-in (2)") >> cognito
        apigw >> Edge(style="dashed", label="Cognito authorizer") >> cognito

        upload >> Edge(label="presigned URL (4)")
        user >> Edge(label="PUT (5)") >> s3_docs

        # Search path
        search >> ddb_meta
        search >> ddb_names

        # Logs
        for n in [upload, search, dup, textract_start, textract_status, comprehend_fn, bedrock_fn, store, apigw, sfn]:
            n >> cw


if __name__ == "__main__":
    main()


