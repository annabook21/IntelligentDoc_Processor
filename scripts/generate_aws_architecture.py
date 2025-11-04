from diagrams import Diagram, Cluster, Edge
from diagrams.aws.general import Users, General
from diagrams.aws.network import CloudFront, APIGateway
from diagrams.aws.storage import S3
from diagrams.aws.security import Cognito
from diagrams.aws.compute import Lambda
from diagrams.aws.integration import Eventbridge, StepFunctions
from diagrams.aws.management import Cloudwatch
from diagrams.aws.database import Dynamodb


def main() -> None:
    # Render a PNG with a white background, top-to-bottom layout, and AWS reference style
    with Diagram(
        "",  # No title at the top
        show=False,
        filename="images/aws-style-architecture",
        outformat="png",
        graph_attr={
            "bgcolor": "transparent",
            "rankdir": "TB",
            "pad": "0.5",
            "nodesep": "1.0",
            "ranksep": "1.5",
            "splines": "ortho", # Use straight lines
        },
        node_attr={
            "fontsize": "12",
        }
    ):
        user = Users("Users")

        with Cluster("AWS Cloud"):
            with Cluster("Web UI component"):
                cf = CloudFront("Amazon CloudFront")
                s3_frontend = S3("S3 WebUIBucket")
                cognito = Cognito("Amazon Cognito")

            with Cluster("API component"):
                apigw = APIGateway("API Gateway")
                upload_lambda = Lambda("Upload Function")
                search_lambda = Lambda("Search Function")
                apigw >> Edge(label="triggers") >> upload_lambda
                apigw >> Edge(label="triggers") >> search_lambda

            with Cluster("Storage & DR component"):
                ddb_meta = Dynamodb("DynamoDB\nMetadata Table")
                ddb_hash = Dynamodb("DynamoDB\nHash Registry")
                ddb_names = Dynamodb("DynamoDB\nDocument Names")

            with Cluster("Document processing component"):
                s3_docs = S3("S3 DocumentsBucket")
                evb = Eventbridge("EventBridge")
                sfn = StepFunctions("Step Functions")

                # Lambdas within the Step Function
                dup_lambda = Lambda("Check Duplicate")
                textract_lambda = Lambda("Textract")
                comprehend_lambda = Lambda("Comprehend")
                bedrock_lambda = Lambda("Bedrock")
                store_lambda = Lambda("Store Metadata")

            with Cluster("AI Services"):
                 textract_svc = General("Amazon Textract")
                 comprehend_svc = General("Amazon Comprehend")
                 bedrock_svc = General("Amazon Bedrock")

            with Cluster("Observability component"):
                cw = Cloudwatch("CloudWatch Logs")

            # Define the flow with numbered labels on edges
            user >> Edge(label="1") >> cf >> s3_frontend
            user >> Edge(label="2", style="dashed") >> cognito
            cf >> Edge(label="3") >> apigw
            apigw >> Edge(label="4") >> upload_lambda
            upload_lambda >> Edge(label="returns presigned URL") >> user
            user >> Edge(label="5") >> s3_docs

            s3_docs >> Edge(label="6") >> evb >> sfn

            # Step Function Flow
            sfn >> Edge(label="7") >> dup_lambda >> ddb_hash
            dup_lambda >> Edge(label="if unique", style="dashed") >> textract_lambda
            textract_lambda >> Edge(label="8") >> textract_svc
            textract_lambda >> Edge(label="9") >> comprehend_lambda >> comprehend_svc
            comprehend_lambda >> Edge(label="10") >> bedrock_lambda >> bedrock_svc
            bedrock_lambda >> Edge(label="11") >> store_lambda
            dup_lambda >> Edge(label="if duplicate", style="dashed") >> store_lambda
            store_lambda >> [ddb_meta, ddb_names]

            # Search/Dashboard Flow
            apigw >> Edge(label="12") >> search_lambda >> [ddb_meta, ddb_names]

            # Logging
            [sfn, upload_lambda, search_lambda, dup_lambda, textract_lambda, comprehend_lambda, bedrock_lambda, store_lambda] >> Edge(label="13", style="dotted") >> cw


if __name__ == "__main__":
    main()


